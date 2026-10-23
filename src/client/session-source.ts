/**
 * Reduce the Harness Client's session-list snapshot into {@link SessionSignal}s.
 *
 * This is the ONLY file that knows the shape of the runtime's session list. A
 * Harness release that renames a field changes this adapter and nothing else;
 * the classifier, the view and every test keep working against the reduced
 * shape.
 *
 * ## What this adapter learned from real data
 *
 * Every field read here was checked against the installed Harness AND against
 * 188 real session logs on disk (`SessionListState` publishes
 * `{ ids, byId, phase, projectionsBySession }`; a summary carries
 * `id / displayTitle / title? / cwd? / parentId? / origin? / running / blank /
 * updatedAt`).
 *
 * Two traps were found by auditing those logs rather than by reading types:
 *
 * 1. **`team/task.ready` does not exist.** A team board records
 *    `{ id, revision, subject, description, status, ... }`; there is no `ready`
 *    field on the wire, so a rule keyed on it is dead code. Worse, the tasks a
 *    board carries are the team's *historical* work items: a finished ticket
 *    keeps listing its `pending` tasks forever, so treating them as "needs a
 *    decision" pins a completed session to the decision board indefinitely.
 * 2. **A parked question is an `ask_user_question` call without its result.**
 *    That is what the logs show for a genuinely blocked session, and it is the
 *    only signal that truly puts work on the user's desk.
 *
 * The consequence: the decision board is driven ONLY by the `userQuestions`
 * projection. Anything broader invents a state the runtime does not have.
 * @module dsh-plugin-status-board/client/session-source
 */

import type { SessionSignal } from '../shared/types.ts'

/**
 * The `userQuestions` projection face.
 *
 * `active` holds the questions currently waiting for a human answer. When the
 * deployment publishes this projection it is the cheapest correct signal; an
 * absent projection simply means "nothing is parked on this session".
 */
export interface UserQuestionsProjectionLike {
  readonly active?: readonly unknown[] | undefined
}

/** One session's projection values (only the slices this plugin reads). */
export interface ProjectionLike {
  readonly values?:
    | {
        readonly userQuestions?: UserQuestionsProjectionLike | undefined
      }
    | undefined
}

/** One session summary as the Client snapshot publishes it. */
export interface SessionSummaryLike {
  readonly id?: string | undefined
  /** Title the browser renders in the sidebar. */
  readonly displayTitle?: string | undefined
  /** Alternate title field some releases carry. */
  readonly title?: string | undefined
  /** Working directory of the session, when known. */
  readonly cwd?: string | undefined
  /** `'subagent'` for child sessions spawned by a delegation. */
  readonly origin?: string | undefined
  /** Durable direct parent id, present on child sessions. */
  readonly parentId?: string | undefined
  /** Whether the session's agent is currently working. */
  readonly running?: boolean | undefined
  /** A session that has never exchanged a message. */
  readonly blank?: boolean | undefined
  /** Newest activity timestamp, when the snapshot carries one. */
  readonly lastActivityAt?: number | undefined
  /** Creation/update timestamp used when `lastActivityAt` is absent. */
  readonly updatedAt?: number | undefined
}

/** The session-list snapshot the Client publishes (`SessionListState`). */
export interface SessionListLike {
  readonly byId?: Readonly<Record<string, SessionSummaryLike>> | undefined
  /** `'pending'` until the first enumeration settles. */
  readonly phase?: 'pending' | 'ready' | undefined
  readonly projectionsBySession?: Readonly<Record<string, ProjectionLike>> | undefined
}

/** The `sessions` service face this plugin consumes. */
export interface SessionsFace {
  readonly list?:
    | {
        getSnapshot(): SessionListLike
        subscribe(listener: () => void): () => void
      }
    | undefined
}

/**
 * Whether the session is blocked on a human answer.
 *
 * Only `userQuestions.active` counts. A team board's `pending` task must not:
 * those rows are the team's work items, they stay `pending` in the log of a
 * finished session forever, and no field marks one as waiting for the user.
 * Treating them as decisions was the defect that pinned a six-day-old completed
 * session to the decision board.
 */
export function isAwaitingDecision(projection: ProjectionLike | undefined): boolean {
  const active = projection?.values?.userQuestions?.active
  return Array.isArray(active) && active.length > 0
}

/** Whether a summary describes a subagent child rather than a top-level session. */
export function isSubagentChild(summary: SessionSummaryLike): boolean {
  return summary.origin === 'subagent' || (typeof summary.parentId === 'string' && summary.parentId.length > 0)
}

/** Pick the first non-blank title, falling back to the id. */
function titleOf(summary: SessionSummaryLike, id: string): string {
  for (const candidate of [summary.displayTitle, summary.title]) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) return trimmed
    }
  }
  return id
}

/** Pick the newest timestamp the summary carries, or `0` when it carries none. */
function lastActivityOf(summary: SessionSummaryLike): number {
  for (const candidate of [summary.lastActivityAt, summary.updatedAt]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate
  }
  return 0
}

/**
 * Turn a session-list snapshot into the classifier's input.
 *
 * Skipped rows, each for a reason the board's question demands:
 * - subagent children — their work is already reflected on the parent, and the
 *   board answers "which of my conversations needs me", not "which fragment is
 *   busy";
 * - blank sessions that never exchanged a message — they have no state to
 *   report, and their default title (the workspace name) reads as a phantom row.
 *
 * @param list - the snapshot (may be `undefined` before the first publication).
 * @returns one signal per visible top-level session, in snapshot order.
 */
export function collectSessionSignals(list: SessionListLike | undefined): SessionSignal[] {
  const byId = list?.byId
  if (byId === undefined) return []

  const signals: SessionSignal[] = []
  const seen = new Set<string>()
  for (const summary of Object.values(byId)) {
    if (typeof summary !== 'object' || summary === null) continue
    if (typeof summary.id !== 'string' || summary.id.length === 0) continue
    if (seen.has(summary.id)) continue
    if (isSubagentChild(summary)) continue
    if (summary.blank === true) continue
    seen.add(summary.id)

    const projection = list?.projectionsBySession?.[summary.id]
    signals.push({
      id: summary.id,
      title: titleOf(summary, summary.id),
      workspacePath: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : undefined,
      running: summary.running === true,
      awaitingDecision: isAwaitingDecision(projection),
      lastActivityAt: lastActivityOf(summary),
    })
  }
  return signals
}