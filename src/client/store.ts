/**
 * The Client half's state container.
 *
 * It is a small external store (`getSnapshot` + `subscribe`) so the view can
 * use `useSyncExternalStore` and re-render only when something actually
 * changed. Three inputs feed it:
 *
 * - the Harness session list (subscribed, the only live input),
 * - the Host-published configuration (fetched once, then fixed for the page),
 * - the user's collapse choices (persisted in `localStorage`).
 *
 * The store owns no polling: the Harness already publishes the session list, so
 * the board re-derives on each legitimate snapshot change. (The view refreshes
 * its relative timestamps locally; see `Panel.tsx`.)
 * @module dsh-plugin-status-board/client/store
 */

import { buildBoard, resolveCollapse, toggleCollapse } from '../shared/board.ts'
import { isCollapseMode, resolveConfig } from '../shared/config.ts'
import { STATUS_BOARD_CONFIG_MARKER, STATUS_BOARD_CONFIG_PATH } from '../shared/route.ts'
import { pickLocale, type LocaleId } from '../shared/i18n.ts'
import { BUCKET_IDS, type BoardSnapshot, type BucketId, type CollapseState, type ResolvedStatusBoardConfig, type StatusBoardConfig } from '../shared/types.ts'
import { collectSessionSignals, type SessionsFace, type SessionListLike } from './session-source.ts'

/** The minimal storage face the store needs (browser `localStorage` subset). */
export interface CollapseStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Locale service face (mirrored structurally). */
export interface LocaleFace {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
}

/** Loading state of the board's data. */
export type BoardStatus = 'loading' | 'ready' | 'error'

/** One immutable view state. */
export interface BoardState {
  /** The three boards. */
  readonly board: BoardSnapshot
  /** Which boards are collapsed right now. */
  readonly collapse: CollapseState
  /** Configuration in force (Host-published, or defaults). */
  readonly config: ResolvedStatusBoardConfig
  /**
   * `'loading'` while the Harness is still enumerating sessions, `'error'` when
   * the profile exposes no session list at all, otherwise `'ready'`.
   */
  readonly status: BoardStatus
  /** Active locale id, resolved from the Harness locale service. */
  readonly locale: LocaleId
}

/** The store's public surface. */
export interface BoardStore {
  getSnapshot(): BoardState
  subscribe(listener: () => void): () => void
  /** Flip one board, persisting the choice. */
  toggle(id: BucketId): void
  /** Stop every subscription (plugin unload / HMR). */
  dispose(): void
}

/** Persistence key; versioned so a future shape change can ignore old data. */
export const COLLAPSE_STORAGE_KEY = 'dsh-plugin-status-board.collapse.v1'

/** Inputs the Client half hands the store. */
export interface BoardStoreOptions {
  /** The Harness `sessions` service, when the profile provides one. */
  readonly sessions?: SessionsFace | undefined
  /** The Harness locale service, when the profile provides one. */
  readonly locale?: LocaleFace | undefined
  /** Browser storage; `undefined` disables persistence. */
  readonly storage?: CollapseStorage | undefined
  /** Clock injection point (tests). */
  readonly now?: (() => number) | undefined
  /**
   * Configuration source. Defaults to fetching {@link STATUS_BOARD_CONFIG_PATH};
   * tests replace it with a synchronous value.
   */
  readonly loadConfig?: (() => Promise<ResolvedStatusBoardConfig | undefined>) | undefined
}

/**
 * Read a persisted collapse state.
 *
 * Only a complete, well-typed record is accepted; anything else (older shape,
 * corrupted JSON, a board added later) falls back to `undefined` so the
 * configured default applies instead of an arbitrary partial state.
 */
export function parseCollapse(raw: string | null): CollapseState | undefined {
  if (raw === null) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const state: Partial<Record<BucketId, boolean>> = {}
  for (const id of BUCKET_IDS) {
    const value = record[id]
    if (typeof value !== 'boolean') return undefined
    state[id] = value
  }
  return { decision: state.decision ?? false, executing: state.executing ?? false, recent: state.recent ?? false }
}

/** Serialize a collapse state for persistence. */
export function serializeCollapse(state: CollapseState): string {
  return JSON.stringify({ decision: state.decision, executing: state.executing, recent: state.recent })
}

/**
 * Narrow an untrusted JSON value into a `StatusBoardConfig`.
 *
 * The Host is not an adversarial party, but it can be an *older or newer*
 * build, and a proxy can answer in its place. Unknown keys are dropped and
 * wrong-typed values are omitted, so `resolveConfig` then applies its own
 * defaults and bounds instead of receiving `as never` nonsense.
 */
export function toStatusBoardConfig(value: unknown): StatusBoardConfig | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const config: {
    recentWindowHours?: number
    maxRecent?: number
    defaultCollapsed?: StatusBoardConfig['defaultCollapsed']
    showEmptyBuckets?: boolean
  } = {}
  if (typeof record.recentWindowHours === 'number') config.recentWindowHours = record.recentWindowHours
  if (typeof record.maxRecent === 'number') config.maxRecent = record.maxRecent
  // Validate the enum here instead of casting: an unknown string would
  // otherwise be pushed into `resolveConfig` and silently replaced there,
  // which hides the disagreement between Host and Client versions.
  if (isCollapseMode(record.defaultCollapsed)) config.defaultCollapsed = record.defaultCollapsed
  if (typeof record.showEmptyBuckets === 'boolean') config.showEmptyBuckets = record.showEmptyBuckets
  return config
}

/**
 * Fetch the Host-published configuration.
 *
 * Every failure path is a fallback, never an exception: the panel must render on
 * a deployment whose Host half is absent (installed but disabled), on a
 * non-browser host, or while the web server is still starting.
 *
 * @param fetchImpl - the browser `fetch`.
 * @param timeoutMs - bound on the request so a hung server cannot block paint.
 */
export async function loadPublishedConfig(
  fetchImpl: typeof fetch | undefined,
  timeoutMs = 1_500,
): Promise<ResolvedStatusBoardConfig | undefined> {
  // A missing `fetch` is not an error worth surfacing: the board simply keeps
  // its documented defaults.
  if (typeof fetchImpl !== 'function') return undefined

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(STATUS_BOARD_CONFIG_PATH, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
      credentials: 'same-origin',
    })
    if (!response.ok) return undefined
    const payload = (await response.json()) as { marker?: unknown; config?: unknown }
    if (payload.marker !== STATUS_BOARD_CONFIG_MARKER) return undefined
    return resolveConfig(toStatusBoardConfig(payload.config))
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve the initial collapse state: a stored user choice wins, otherwise the
 * configured default applies.
 */
function initialState(config: ResolvedStatusBoardConfig, storage: CollapseStorage | undefined): CollapseState {
  const stored = readStoredCollapse(storage)
  return stored ?? resolveCollapse(config.defaultCollapsed)
}

/** Read the persisted collapse state, tolerating unavailable or throwing storage. */
function readStoredCollapse(storage: CollapseStorage | undefined): CollapseState | undefined {
  if (storage === undefined) return undefined
  try {
    return parseCollapse(storage.getItem(COLLAPSE_STORAGE_KEY))
  } catch {
    return undefined
  }
}

/**
 * Create the store.
 *
 * @param options - the services and seams the store may use.
 * @returns a store the view can subscribe to.
 */
export function createBoardStore(options: BoardStoreOptions): BoardStore {
  const listeners = new Set<() => void>()
  const now = options.now ?? (() => Date.now())
  const storage = options.storage

  let config: ResolvedStatusBoardConfig = resolveConfig(undefined)
  let collapse: CollapseState = initialState(config, storage)
  /** True once the user has expressed a preference this page load. */
  let userTouched = readStoredCollapse(storage) !== undefined
  let disposed = false
  let state: BoardState = compute()

  const disposers: Array<() => void> = []

  /** Build the current state from every input. */
  function compute(): BoardState {
    const list = options.sessions?.list?.getSnapshot()
    const signals = collectSessionSignals(list)
    return {
      board: buildBoard(signals, config, now()),
      collapse,
      config,
      status: statusOf(list),
      locale: pickLocale(options.locale?.getSnapshot().active),
    }
  }

  /** Derive the data state from the session-list phase. */
  function statusOf(list: SessionListLike | undefined): BoardStatus {
    if (options.sessions?.list === undefined || list === undefined) return 'error'
    return list.phase === 'pending' ? 'loading' : 'ready'
  }

  /** Rebuild the immutable state and notify subscribers when it changed. */
  function recompute(): void {
    if (disposed) return
    const next = compute()
    if (sameState(state, next)) return
    state = next
    for (const listener of listeners) listener()
  }

  // Live input: the Harness session list.
  const sessionList = options.sessions?.list
  if (sessionList !== undefined) {
    disposers.push(sessionList.subscribe(() => recompute()))
  }

  // Locale changes only affect copy, not the board, but the view must re-render.
  if (options.locale !== undefined) {
    disposers.push(options.locale.subscribe(() => recompute()))
  }

  // Configuration arrives asynchronously; the board renders with defaults until
  // it lands, which keeps the first paint instant.
  const loadConfig = options.loadConfig ?? (() => loadPublishedConfig(globalThis.fetch))

  /** Fetch the configuration once and fold it into the state. */
  function syncConfig(): void {
    loadConfig()
      .then(published => {
        if (disposed || published === undefined) return
        config = published
        // Adopt the newly published default ONLY while the user has expressed no
        // preference; otherwise their clicks would be silently reverted when the
        // config lands a moment later.
        if (!userTouched) collapse = resolveCollapse(published.defaultCollapsed)
        recompute()
      })
      .catch(() => {
        // A failed configuration load is not a rendering failure: the documented
        // defaults stay in force.
      })
  }

  syncConfig()

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    toggle(id) {
      if (disposed) return
      // Any toggle is a user preference from now on: a later configuration
      // publication must not overwrite it.
      userTouched = true
      collapse = toggleCollapse(collapse, id)
      if (storage !== undefined) {
        try {
          storage.setItem(COLLAPSE_STORAGE_KEY, serializeCollapse(collapse))
        } catch {
          // Storage may be full or blocked (private mode); the in-memory choice
          // still applies for this page.
        }
      }
      recompute()
    },
    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
      for (const disposer of disposers) disposer()
      disposers.length = 0
    },
  }
}

/**
 * Cheap structural comparison so an identical recompute does not re-render.
 *
 * Deliberately thorough: an earlier version short-circuited on the build
 * timestamp (so two publications in the same millisecond compared equal and the
 * change was dropped) and compared rows by id/title only (so a row's activity
 * timestamp — which drives the relative-time text — never triggered a repaint).
 */
function sameState(left: BoardState, right: BoardState): boolean {
  if (left.status !== right.status || left.locale !== right.locale) return false
  if (left.config !== right.config) return false
  for (const id of BUCKET_IDS) {
    if (left.collapse[id] !== right.collapse[id]) return false
    if (left.board.counts[id] !== right.board.counts[id]) return false
  }
  for (let index = 0; index < left.board.buckets.length; index += 1) {
    const leftBoard = left.board.buckets[index]
    const rightBoard = right.board.buckets[index]
    if (leftBoard === undefined || rightBoard === undefined) return false
    if (leftBoard.truncated !== rightBoard.truncated) return false
    if (leftBoard.entries.length !== rightBoard.entries.length) return false
    for (let row = 0; row < leftBoard.entries.length; row += 1) {
      const a = leftBoard.entries[row]
      const b = rightBoard.entries[row]
      if (a === undefined || b === undefined) return false
      if (a.id !== b.id) return false
      if (a.title !== b.title) return false
      if (a.lastActivityAt !== b.lastActivityAt) return false
      if (a.workspacePath !== b.workspacePath) return false
      // Question payloads are small and only present on decision rows; a
      // structural compare keeps a changed option list from being dropped as
      // "same row" (which would leave the card showing stale labels).
      if (JSON.stringify(a.questions) !== JSON.stringify(b.questions)) return false
    }
  }
  return true
}