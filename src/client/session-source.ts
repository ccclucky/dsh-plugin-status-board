/**
 * Reduce the Harness Client's session-list snapshot into {@link SessionSignal}s.
 *
 * This is the ONLY file that knows the shape of the runtime's session list. A
 * Harness release that renames a field changes this adapter and nothing else;
 * the classifier, the view and every test keep working against the reduced
 * shape.
 *
 * Every field read below was checked against the installed Harness
 * (`@deepseek-ai/dsh-api-session-controller`): `SessionListState` publishes
 * `{ ids, byId, phase, projectionsBySession }`, and each `SessionSummary`
 * carries `id / displayTitle / title? / cwd? / parentId? / origin? / running /
 * blank / updatedAt`. There is no scalar "awaiting decision" field, so that
 * state is derived from the session's own projections instead — see
 * {@link isAwaitingDecision}.
 * @module dsh-plugin-status-board/client/session-source
 */

import type { SessionSignal } from '../shared/types.ts'

/** One team-task row of the Lead session's `agentTeam` projection. */
export interface TeamTaskLike {
  readonly status?: string | undefined
  readonly ready?: boolean | undefined
}

/**
 * The `userQuestions` projection face.
 *
 * `active` holds the questions currently waiting for a human answer; an empty
 * or absent list means nothing is pending. The projection is the runtime's
 * authoritative "the user owes this session an answer" signal.
 */
export interface UserQuestionsProjectionLike {
  readonly active?: readonly unknown[] | undefined
}

/** One session's projection values (only the slices this plugin reads). */
export interface ProjectionLike {
  readonly values?:
    | {
        readonly userQuestions?: UserQuestionsProjectionLike | undefined
        readonly agentTeam?:
          | { readonly tasks?: readonly TeamTaskLike[] | undefined }
          | undefined
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
 * Whether a session's team board holds a task that is both ready and pending —
 * a decision only the Lead (and through it, the user) can take.
 */
export function hasReadyPendingTeamTask(projection: ProjectionLike | undefined): boolean {
  const tasks = projection?.values?.agentTeam?.tasks
  if (!Array.isArray(tasks)) return false
  return tasks.some(task => task.status === 'pending' && task.ready === true)
}

/**
 * Whether the session is blocked on a human answer.
 *
 * Both branches are real, durable projections of the installed Harness:
 *
 * - `userQuestions.active` — the `ask_user_question` tool is parked waiting for
 *   the user (including plan review, which is a question with a `plan-review`
 *   intent).
 * - `agentTeam.tasks` with `ready && pending` — a shared team task is unclaimed
 *   and unblocked, so the Lead has to decide who takes it.
 *
 * A session with neither is not "awaiting a decision", however long it has been
 * idle: idleness is not a request for the user.
 */
export function isAwaitingDecision(projection: ProjectionLike | undefined): boolean {
  const active = projection?.values?.userQuestions?.active
  if (Array.isArray(active) && active.length > 0) return true
  return hasReadyPendingTeamTask(projection)
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