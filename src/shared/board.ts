/**
 * The board's pure core: classification, ordering, capping and collapse state.
 *
 * Every function here is deterministic and free of I/O so the delivery
 * contract (which board a Session lands in, in what order, and how many rows
 * survive the cap) is covered by ordinary unit tests instead of a live Harness.
 * @module dsh-plugin-status-board/shared/board
 */

import {
  BUCKET_IDS,
  type BoardBucket,
  type BoardEntry,
  type BoardSnapshot,
  type BucketId,
  type CollapseMode,
  type CollapseState,
  type ResolvedStatusBoardConfig,
  type SessionSignal,
} from './types.ts'

/** Milliseconds in one hour; kept local so the arithmetic is self-documenting. */
const HOUR_MS = 3_600_000

/**
 * Clamp a configured number into an inclusive integer range.
 *
 * `buildBoard` is a public function and the Client's config can arrive from an
 * older Host build, so the bound is enforced here as well as in
 * `resolveConfig`; a caller that bypasses the resolver must not be able to
 * request an unbounded window.
 */
function clampToRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Classify one Session.
 *
 * Precedence is intentional and ordered:
 * 1. `awaitingDecision` wins outright — a Session that cannot proceed without
 *    the user is not "in progress" in any useful sense.
 * 2. `running` next — the Agent is doing work.
 * 3. everything else is a record.
 *
 * @param signal - the Session's reduced state.
 * @returns the board it belongs to.
 */
export function classifySession(signal: SessionSignal): BucketId {
  if (signal.awaitingDecision) return 'decision'
  if (signal.running) return 'executing'
  return 'recent'
}

/**
 * Newest first, ties broken by id so the order is stable across snapshots
 * (two Sessions touched in the same millisecond must not swap places on every
 * render).
 */
export function compareByRecency(left: SessionSignal, right: SessionSignal): number {
  if (left.lastActivityAt !== right.lastActivityAt) {
    return right.lastActivityAt - left.lastActivityAt
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Whether a Session falls inside the "recent records" window.
 *
 * An unknown timestamp (`0`, or any non-finite value) is treated as recent:
 * hiding a Session because its timestamp is missing would be a silent data
 * loss for the user.
 */
export function isWithinWindow(signal: SessionSignal, now: number, windowHours: number): boolean {
  const stamp = signal.lastActivityAt
  if (!Number.isFinite(stamp) || stamp <= 0) return true
  return now - stamp <= windowHours * HOUR_MS
}

/** Reduce a signal to the row shape the view renders. */
function toEntry(signal: SessionSignal): BoardEntry {
  return {
    id: signal.id,
    title: signal.title,
    workspacePath: signal.workspacePath,
    lastActivityAt: signal.lastActivityAt,
    ...(signal.questions === undefined || signal.questions.length === 0 ? {} : { questions: signal.questions }),
  }
}

/**
 * Build one board.
 *
 * @param id - which board.
 * @param entries - already ordered rows.
 * @param truncated - rows the cap hid.
 */
function bucket(id: BucketId, entries: readonly BoardEntry[], truncated = 0): BoardBucket {
  return { id, entries, truncated }
}

/**
 * Turn Session signals into the three boards.
 *
 * @param signals - every Session the caller can see.
 * @param config - resolved plugin configuration.
 * @param now - clock injection point (epoch ms); defaults to `Date.now()`.
 * @returns a snapshot whose three boards are always present.
 */
export function buildBoard(
  signals: readonly SessionSignal[],
  config: Pick<ResolvedStatusBoardConfig, 'recentWindowHours' | 'maxRecent'>,
  now: number = Date.now(),
): BoardSnapshot {
  // A total, pre-seeded record: a Map lookup that missed would silently drop a
  // session from every board, which is worse than the type noise a `!` avoids.
  const buckets: Record<BucketId, SessionSignal[]> = { decision: [], executing: [], recent: [] }
  for (const signal of signals) {
    buckets[classifySession(signal)].push(signal)
  }

  const windowHours = clampToRange(config.recentWindowHours, 1, 720, 24)
  const maxRecent = clampToRange(config.maxRecent, 1, 200, 20)

  const decision = [...buckets.decision].sort(compareByRecency).map(toEntry)
  const executing = [...buckets.executing].sort(compareByRecency).map(toEntry)
  const recentAll = [...buckets.recent]
    .filter(signal => isWithinWindow(signal, now, windowHours))
    .sort(compareByRecency)
    .map(toEntry)
  const recent = recentAll.slice(0, maxRecent)
  const truncated = recentAll.length - recent.length

  const orders: Record<BucketId, BoardBucket> = {
    decision: bucket('decision', decision),
    executing: bucket('executing', executing),
    recent: bucket('recent', recent, truncated),
  }

  const ordered = BUCKET_IDS.map(id => orders[id])
  return {
    generatedAt: now,
    windowHours,
    buckets: ordered,
    counts: {
      decision: decision.length,
      executing: executing.length,
      recent: recent.length,
    },
  }
}

/** Total number of rows currently visible across every board. */
export function totalRows(snapshot: BoardSnapshot): number {
  return snapshot.buckets.reduce((sum, board) => sum + board.entries.length, 0)
}

/** Resolve the configured initial collapse mode into a concrete state. */
export function resolveCollapse(mode: CollapseMode): CollapseState {
  const collapsed = mode === 'all'
  return {
    decision: collapsed || mode === 'decision',
    executing: collapsed || mode === 'executing',
    recent: collapsed || mode === 'recent',
  }
}

/** Flip one board's collapse state, returning a new immutable state. */
export function toggleCollapse(state: CollapseState, id: BucketId): CollapseState {
  return { ...state, [id]: !state[id] }
}

/** Whether `id` is collapsed in `state`. */
export function isCollapsed(state: CollapseState, id: BucketId): boolean {
  return state[id]
}

/**
 * The accessible label the toggle button announces: it names the board, the
 * resulting action, and the row count, so a screen-reader user does not need
 * the visual badge.
 */
export function bucketToggleLabel(
  translate: (key: 'bucket.expand' | 'bucket.collapse', params: Record<string, string | number>) => string,
  name: string,
  collapsed: boolean,
  count: number,
): string {
  return translate(collapsed ? 'bucket.expand' : 'bucket.collapse', { name, count })
}