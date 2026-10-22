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
 * The store owns no timers and no polling: the Harness already publishes the
 * session list, so the board re-derives on each legitimate snapshot change.
 * @module dsh-plugin-status-board/client/store
 */

import { buildBoard } from '../shared/board.ts'
import { CONFIG_DEFAULTS, resolveConfig } from '../shared/config.ts'
import { STATUS_BOARD_CONFIG_MARKER, STATUS_BOARD_CONFIG_PATH } from '../shared/route.ts'
import { pickLocale, type LocaleId } from '../shared/i18n.ts'
import { BUCKET_IDS, type BoardSnapshot, type BucketId, type CollapseState, type ResolvedStatusBoardConfig } from '../shared/types.ts'
import { collectSessionSignals, type SessionsFace } from './session-source.ts'

/** The minimal storage face the store needs (browser `localStorage` subset). */
export interface CollapseStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Locale service face (mirrored structurally; see the Client half's header). */
export interface LocaleFace {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
}

/** One immutable view state. */
export interface BoardState {
  /** The three boards. */
  readonly board: BoardSnapshot
  /** Which boards are collapsed right now. */
  readonly collapse: CollapseState
  /** Configuration in force (Host-published, or defaults). */
  readonly config: ResolvedStatusBoardConfig
  /** `'error'` only when the Harness exposes no session list at all. */
  readonly status: 'loading' | 'ready' | 'error'
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
 * Fetch the Host-published configuration.
 *
 * Every failure path is a fallback, never an exception: the panel must render
 * on a deployment whose Host half is absent (installed but disabled), or while
 * the web server is still starting.
 *
 * @param fetchImpl - the browser `fetch`.
 * @param timeoutMs - bound on the request so a hung server cannot block paint.
 */
export async function loadPublishedConfig(
  fetchImpl: typeof fetch,
  timeoutMs = 1_500,
): Promise<ResolvedStatusBoardConfig | undefined> {
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
    return resolveConfig(payload.config as never)
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Resolve the initial collapse state from storage, then the configured default. */
function initialCollapse(config: ResolvedStatusBoardConfig, storage: CollapseStorage | undefined): CollapseState {
  const stored = storage === undefined ? undefined : parseCollapse(storage.getItem(COLLAPSE_STORAGE_KEY))
  if (stored !== undefined) return stored
  const mode = config.defaultCollapsed
  return {
    decision: mode === 'all' || mode === 'decision',
    executing: mode === 'all' || mode === 'executing',
    recent: mode === 'all' || mode === 'recent',
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

  let config: ResolvedStatusBoardConfig = resolveConfig(undefined)
  let collapse: CollapseState = initialCollapse(config, options.storage)
  let state: BoardState = compute()
  let disposed = false

  /** Rebuild the immutable state and notify subscribers when it changed. */
  function recompute(): void {
    if (disposed) return
    const next = compute()
    if (sameState(state, next)) return
    state = next
    for (const listener of listeners) listener()
  }

  /** Build the current state from every input. */
  function compute(): BoardState {
    const list = options.sessions?.list?.getSnapshot()
    const signals = collectSessionSignals(list)
    return {
      board: buildBoard(signals, config, now()),
      collapse,
      config,
      status: options.sessions?.list === undefined ? 'error' : 'ready',
      locale: pickLocale(options.locale?.getSnapshot().active),
    }
  }

  const disposers: Array<() => void> = []

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
  const loadConfig = options.loadConfig ?? (() => loadPublishedConfig(fetch))
  void loadConfig()
    .then(published => {
      if (disposed || published === undefined) return
      config = published
      // A stored collapse choice outranks the configured default; only an
      // untouched board adopts the freshly published default.
      if (options.storage?.getItem(COLLAPSE_STORAGE_KEY) == null) {
        collapse = initialCollapse(published, undefined)
      }
      recompute()
    })
    .catch(() => {})

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    toggle(id) {
      collapse = { ...collapse, [id]: !collapse[id] }
      try {
        options.storage?.setItem(COLLAPSE_STORAGE_KEY, serializeCollapse(collapse))
      } catch {
        // Storage may be full or blocked (private mode); the in-memory choice
        // still applies for this page.
      }
      recompute()
    },
    dispose() {
      disposed = true
      listeners.clear()
      for (const disposer of disposers) disposer()
      disposers.length = 0
    },
  }
}

/** Cheap structural comparison so an identical recompute does not re-render. */
function sameState(left: BoardState, right: BoardState): boolean {
  if (left === right) return true
  if (left.status !== right.status || left.locale !== right.locale) return false
  if (left.config !== right.config) return false
  for (const id of BUCKET_IDS) {
    if (left.collapse[id] !== right.collapse[id]) return false
    if (left.board.counts[id] !== right.board.counts[id]) return false
    if (left.board.buckets[BUCKET_IDS.indexOf(id)]?.truncated !== right.board.buckets[BUCKET_IDS.indexOf(id)]?.truncated) {
      return false
    }
  }
  return left.board.generatedAt === right.board.generatedAt || sameRows(left.board, right.board)
}

/** Whether two snapshots list the same rows in the same order. */
function sameRows(left: BoardSnapshot, right: BoardSnapshot): boolean {
  for (let index = 0; index < left.buckets.length; index += 1) {
    const leftRows = left.buckets[index]?.entries
    const rightRows = right.buckets[index]?.entries
    if (leftRows === undefined || rightRows === undefined || leftRows.length !== rightRows.length) return false
    for (let row = 0; row < leftRows.length; row += 1) {
      if (leftRows[row]?.id !== rightRows[row]?.id) return false
      if (leftRows[row]?.title !== rightRows[row]?.title) return false
    }
  }
  return true
}

/** Default configuration, re-exported so the view's empty state can read it. */
export const DEFAULT_CONFIG = CONFIG_DEFAULTS