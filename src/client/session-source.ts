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

import type { ActiveQuestion, QuestionOption, SessionQuestion, SessionSignal } from '../shared/types.ts'

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
  /**
   * Projection values carried by the list row itself (the Host's list
   * projection column). The resident `projectionsBySession` map is the
   * fallback for compositions that only publish it there.
   */
  readonly projectionValues?: ProjectionValuesLike | undefined
}

/** The values slice of a session projection snapshot. */
export interface ProjectionValuesLike {
  readonly userQuestions?: UserQuestionsProjectionLike | undefined
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

/** Narrow an unknown value to a string, trimming nothing. */
function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Whether a value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the selectable options of one question, dropping malformed entries. */
function optionsOf(value: unknown): QuestionOption[] | undefined {
  if (!Array.isArray(value)) return undefined
  const options: QuestionOption[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    const label = stringOf(candidate.label)
    if (label === undefined) continue
    const description = stringOf(candidate.description)
    options.push({ label, ...(description === undefined ? {} : { description }) })
  }
  return options.length === 0 ? undefined : options
}

/** Read one question, or `undefined` when it cannot be rendered. */
function questionOf(value: unknown): SessionQuestion | undefined {
  if (!isRecord(value)) return undefined
  const id = stringOf(value.id)
  const question = stringOf(value.question)
  if (id === undefined || question === undefined) return undefined
  const detail = stringOf(value.detail)
  const header = stringOf(value.header)
  const options = optionsOf(value.options)
  const multiSelect = typeof value.multiSelect === 'boolean' ? value.multiSelect : undefined
  return {
    id,
    question,
    ...(detail === undefined ? {} : { detail }),
    ...(header === undefined ? {} : { header }),
    ...(options === undefined ? {} : { options }),
    ...(multiSelect === undefined ? {} : { multiSelect }),
  }
}

/**
 * Reduce the `userQuestions` projection into renderable question calls.
 *
 * The wire value is narrowed instead of trusted: an older Host, a proxy, or a
 * future schema can hand the board anything, and a malformed question must not
 * take down the row. An entry missing its call id, state, or every renderable
 * question is skipped; callers keep the raw `isAwaitingDecision` check for
 * classification so a malformed-but-present call still lands on the decision
 * board (and can be opened in the session) instead of silently disappearing.
 */
export function questionsOf(projection: ProjectionLike | undefined): readonly ActiveQuestion[] {
  const active = projection?.values?.userQuestions?.active
  if (!Array.isArray(active)) return []
  const calls: ActiveQuestion[] = []
  for (const candidate of active) {
    if (!isRecord(candidate)) continue
    const callId = stringOf(candidate.callId)
    const state = candidate.state === 'open' || candidate.state === 'continued' ? candidate.state : undefined
    if (callId === undefined || state === undefined || !Array.isArray(candidate.questions)) continue
    const questions: SessionQuestion[] = []
    for (const item of candidate.questions) {
      const question = questionOf(item)
      if (question !== undefined) questions.push(question)
    }
    if (questions.length > 0) calls.push({ callId, questions, state })
  }
  return calls
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
 * Resolve the projection values for one row.
 *
 * The Host publishes them on the row (`projectionValues`); older compositions
 * expose the resident store through `projectionsBySession`. Reading both keeps
 * the question card working across that shape change without touching the
 * classifier.
 */
function projectionOf(summary: SessionSummaryLike, id: string, list: SessionListLike | undefined): ProjectionLike | undefined {
  const rowQuestions = summary.projectionValues?.userQuestions
  if (rowQuestions !== undefined) return { values: { userQuestions: rowQuestions } }
  return list?.projectionsBySession?.[id]
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

    const projection = projectionOf(summary, summary.id, list)
    const questions = questionsOf(projection)
    signals.push({
      id: summary.id,
      title: titleOf(summary, summary.id),
      workspacePath: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : undefined,
      running: summary.running === true,
      awaitingDecision: isAwaitingDecision(projection),
      ...(questions.length === 0 ? {} : { questions }),
      lastActivityAt: lastActivityOf(summary),
    })
  }
  return signals
}