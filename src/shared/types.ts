/**
 * Types shared by the Host half, the Client half, and the unit tests.
 *
 * Nothing here imports a Harness package: the board's contract has to stay
 * valid on both sides of the wire and in plain Node test runs.
 * @module dsh-plugin-status-board/shared/types
 */

/** The three boards, in the fixed order they are rendered. */
export const BUCKET_IDS = ['decision', 'executing', 'recent'] as const

/** Identity of one board. */
export type BucketId = (typeof BUCKET_IDS)[number]

/**
 * What one Session looks like to the classifier.
 *
 * This is deliberately narrower than any runtime snapshot: an adapter is
 * responsible for reducing whatever the Harness publishes into this shape,
 * and every field below has a documented meaning so the classification can be
 * tested without a live Harness.
 */
export interface SessionSignal {
  /** Stable Session id. */
  readonly id: string
  /** Human-readable title, already trimmed by the adapter. */
  readonly title: string
  /** Workspace directory the Session runs in, when the adapter knows it. */
  readonly workspacePath?: string | undefined
  /** Whether the Session's Agent is currently working. */
  readonly running: boolean
  /**
   * Whether the Session is blocked on a decision only the user can make
   * (a pending approval, a pending question, or a team task waiting for its
   * owner). Such a Session outranks `running`: work cannot continue until the
   * user acts.
   */
  readonly awaitingDecision: boolean
  /**
   * Epoch milliseconds of the Session's newest observed activity. `0` means
   * "not known", which keeps a Session visible instead of silently dropping
   * it.
   */
  readonly lastActivityAt: number
}

/** One rendered row. */
export interface BoardEntry {
  readonly id: string
  readonly title: string
  readonly workspacePath?: string | undefined
  readonly lastActivityAt: number
}

/** One board: its rows plus how many rows the cap hid. */
export interface BoardBucket {
  readonly id: BucketId
  readonly entries: readonly BoardEntry[]
  /** Rows dropped by the `maxRecent` cap (always `0` outside `recent`). */
  readonly truncated: number
}

/** The whole board, ready to render. */
export interface BoardSnapshot {
  /** Epoch milliseconds the snapshot was built at. */
  readonly generatedAt: number
  /** Window applied to `recent`, in hours. */
  readonly windowHours: number
  /** Always contains all three boards, in {@link BUCKET_IDS} order. */
  readonly buckets: readonly BoardBucket[]
  /** Per-board row counts (after the cap). */
  readonly counts: Readonly<Record<BucketId, number>>
}

/** Collapse state of the three boards. `true` means "collapsed". */
export type CollapseState = Readonly<Record<BucketId, boolean>>

/** Which boards start collapsed. */
export type CollapseMode = BucketId | 'none' | 'all'

/** Resolved, defaulted plugin configuration. */
export interface ResolvedStatusBoardConfig {
  /** Width of the "recent records" window, in hours. */
  readonly recentWindowHours: number
  /** Maximum rows shown in the "recent records" board. */
  readonly maxRecent: number
  /** Boards that start collapsed. */
  readonly defaultCollapsed: CollapseMode
  /** Whether empty boards still render their header. */
  readonly showEmptyBuckets: boolean
}

/** Raw configuration as it arrives from `cordis.patch.yml`. */
export interface StatusBoardConfig {
  readonly recentWindowHours?: number | undefined
  readonly maxRecent?: number | undefined
  readonly defaultCollapsed?: CollapseMode | undefined
  readonly showEmptyBuckets?: boolean | undefined
}