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


/** One selectable answer to a question. */
export interface QuestionOption {
  /** Label sent back as the selected value. */
  readonly label: string
  /** Optional explanation shown under the label. */
  readonly description?: string | undefined
}

/** One question in an `ask_user_question` batch. */
export interface SessionQuestion {
  readonly id: string
  readonly question: string
  /** Long-form detail (for example the plan under review). */
  readonly detail?: string | undefined
  /** Short heading the asker supplied. */
  readonly header?: string | undefined
  readonly options?: readonly QuestionOption[] | undefined
  readonly multiSelect?: boolean | undefined
}

/** State of one answerable question call. */
export type QuestionState = 'open' | 'continued'

/** One `ask_user_question` call currently waiting for the user. */
export interface ActiveQuestion {
  /** Tool-call identity the answer must name. */
  readonly callId: string
  /** Questions in this batch; normally one. */
  readonly questions: readonly SessionQuestion[]
  /**
   * `open` while the foreground wait is still live, `continued` once the tool
   * returned pending or the original process ended.
   */
  readonly state: QuestionState
}

/** One answer in an answer batch. */
export interface QuestionAnswer {
  readonly id: string
  /** Selected option labels; empty means "skipped". */
  readonly selected: readonly string[]
  /** Free-text answer, sent alongside or instead of the options. */
  readonly custom?: string | undefined
}

/** The complete structured answer for one question call. */
export interface AnswerBatch {
  readonly answers: readonly QuestionAnswer[]
}

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
   * Whether the Session is blocked on a decision only the user can make.
   *
   * Derived from the Session's `userQuestions` projection: a parked
   * `ask_user_question` entry, i.e. the tool waiting for a human answer (plan
   * review included). Such a Session outranks `running` — work cannot continue
   * until the user acts.
   *
   * Two things are deliberately NOT here:
   *
   * - A pending *approval*: the Conversation's own approval UI renders it and it
   *   is not published as a session-list projection, so no field of this shape
   *   can see it.
   * - A `pending` team task: measured on disk, a team board keeps its task rows
   *   `pending` forever after a ticket ends (`ready` is absent from the wire),
   *   so keying on it pinned finished sessions to the decision board.
   */
  readonly awaitingDecision: boolean
  /**
   * Answerable question calls carried by the Session's `userQuestions`
   * projection, in ask order. Only populated while a human answer is pending;
   * `undefined`/empty means the Session has no question card to render.
   */
  readonly questions?: readonly ActiveQuestion[] | undefined
  /**
   * Epoch milliseconds of the Session's newest observed activity. `0` means
   * "not known", which keeps a Session visible instead of silently dropping
   * it.
   *
   * Fed by `updatedAt`, the only timestamp the Harness session summary
   * publishes today.
   */
  readonly lastActivityAt: number
}

/** One rendered row. */
export interface BoardEntry {
  readonly id: string
  readonly title: string
  readonly workspacePath?: string | undefined
  readonly lastActivityAt: number
  /** Answerable question calls, when the Session currently has one. */
  readonly questions?: readonly ActiveQuestion[] | undefined
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