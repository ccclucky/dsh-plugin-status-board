/**
 * Reduce the Harness Client's session-list snapshot into {@link SessionSignal}s.
 *
 * This is the ONLY file that knows the shape of the runtime's session list. A
 * Harness release that renames a field changes this adapter and nothing else;
 * the classifier, the view and every test keep working against the reduced
 * shape.
 *
 * The published shape is mirrored structurally (no Harness import) for the same
 * reason the Host half mirrors its services: a bundle must build in this
 * repository and resolve the deployment's packages at load time. Optional
 * fields are read through explicit `unknown`-safe checks, so a stricter or
 * leaner snapshot degrades instead of throwing.
 * @module dsh-plugin-status-board/client/session-source
 */

import type { SessionSignal } from '../shared/types.ts'

/** Status words a snapshot may use for "blocked on the user". */
const AWAITING_STATUSES: ReadonlySet<string> = new Set([
  'awaiting',
  'awaiting-decision',
  'awaiting_decision',
  'pending-decision',
  'needs-decision',
  'approval',
])

/** One session summary as the Client snapshot publishes it. */
export interface SessionSummaryLike {
  readonly id?: string | undefined
  /** Title the browser renders in the sidebar. */
  readonly displayTitle?: string | undefined
  /** Older/alternate title field some releases use. */
  readonly title?: string | undefined
  /** Working directory of the session, when known. */
  readonly cwd?: string | undefined
  /** `'subagent'` for child sessions spawned by a delegation. */
  readonly origin?: string | undefined
  /** Durable direct parent id, present on child sessions. */
  readonly parentId?: string | undefined
  /** Whether the session's agent is currently working. */
  readonly running?: boolean | undefined
  /** Newest activity timestamp, when the snapshot carries one. */
  readonly lastActivityAt?: number | undefined
  /** Creation/update timestamp used when `lastActivityAt` is absent. */
  readonly updatedAt?: number | undefined
  /** Explicit "blocked on the user" flag, when the release publishes one. */
  readonly awaitingDecision?: boolean | undefined
  /** Coarse session status, when the release publishes one. */
  readonly status?: string | undefined
  /** Pending-interaction marker, when the release publishes one. */
  readonly interaction?: string | undefined
}

/** One team-task row of the Lead session's `agentTeam` projection. */
export interface TeamTaskLike {
  readonly status?: string | undefined
  readonly ready?: boolean | undefined
}

/** One session's projection values (the slice this plugin reads). */
export interface ProjectionLike {
  readonly values?:
    | {
        readonly agentTeam?:
          | { readonly tasks?: readonly TeamTaskLike[] | undefined }
          | undefined
      }
    | undefined
}

/** The session-list snapshot the Client publishes. */
export interface SessionListLike {
  readonly byId?: Readonly<Record<string, SessionSummaryLike>> | undefined
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
 * i.e. a decision the Lead (and through it, the user) has to act on.
 *
 * @param projection - the session's projections, when the snapshot has them.
 */
export function hasReadyPendingTeamTask(projection: ProjectionLike | undefined): boolean {
  const tasks = projection?.values?.agentTeam?.tasks
  if (!Array.isArray(tasks)) return false
  return tasks.some(task => task.status === 'pending' && task.ready === true)
}

/**
 * Read the "blocked on the user" state from whatever signal the snapshot
 * publishes.
 *
 * Precedence is deliberate: an explicit flag wins, then a status word, then a
 * pending-interaction marker, then the team-task projection. Every branch is a
 * real field some Harness release exposes; none of them is required, so an
 * unknown shape simply yields `false`.
 */
export function isAwaitingDecision(summary: SessionSummaryLike, projection: ProjectionLike | undefined): boolean {
  if (summary.awaitingDecision === true) return true
  if (typeof summary.status === 'string' && AWAITING_STATUSES.has(summary.status)) return true
  if (summary.interaction === 'pending' || summary.interaction === 'awaiting') return true
  return hasReadyPendingTeamTask(projection)
}

/** Whether a summary describes a subagent child rather than a top-level session. */
export function isSubagentChild(summary: SessionSummaryLike): boolean {
  return summary.origin === 'subagent' || (typeof summary.parentId === 'string' && summary.parentId.length > 0)
}

/** Pick the first non-blank title, falling back to the id. */
function titleOf(summary: SessionSummaryLike, id: string): string {
  const candidates = [summary.displayTitle, summary.title]
  for (const candidate of candidates) {
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
 * Subagent children are skipped: the board answers "which of my conversations
 * needs me", not "which fragment of a tree is busy". A child's work is already
 * visible through its parent's `running` state.
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
    seen.add(summary.id)

    const projection = list?.projectionsBySession?.[summary.id]
    const signal: SessionSignal = {
      id: summary.id,
      title: titleOf(summary, summary.id),
      workspacePath: typeof summary.cwd === 'string' && summary.cwd.length > 0 ? summary.cwd : undefined,
      running: summary.running === true,
      awaitingDecision: isAwaitingDecision(summary, projection),
      lastActivityAt: lastActivityOf(summary),
    }
    signals.push(signal)
  }
  return signals
}