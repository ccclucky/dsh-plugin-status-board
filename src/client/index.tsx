/**
 * Client half of dsh-plugin-status-board.
 *
 * It contributes two entry surfaces to the Harness Web UI:
 *
 * 1. A **sidebar row** in `sidebar.panellist`. Clicking it expands a real,
 *    inline navigation tree under the row (3 status folders, then sessions).
 *    The row's framework click is captured so it does not select a main column;
 *    the tree is portaled into the sidebar's `nav` because the slot gives the
 *    plugin only the row's icon cell.
 * 2. A **floating button** in `shell.overlay`. Clicking it opens the current
 *    board as a popover: filter, 3 boards, and — when the composition exposes
 *    the user-questions Remote — an inline L2 question card for continued
 *    questions.
 *
 * Both surfaces share one store. The tree is navigation only; approval and
 * answer controls stay in the floating board (entry ②) or the session itself.
 *
 * Data comes from the Harness's own session list (`ctx.sessions.list`): the
 * framework already publishes it, so this half subscribes instead of polling.
 * Configuration comes from the Host half's read-only route; when that route is
 * unreachable the board renders with the documented defaults.
 *
 * `inject` is a HARD dependency list. `ctx.slots`, `ctx.sessions` and
 * `ctx.locale` are shipped by the web profile, and declaring them makes Cordis
 * hold activation until all three exist — reading them through `ctx.get` at
 * apply time would race the module graph and could permanently bind
 * `undefined`. `uiWorkspace` is deliberately NOT in the list: it is optional,
 * and its absence only removes the rows' "open" affordance.
 * @module dsh-plugin-status-board/client
 */

import { createElement, type ReactElement } from 'react'
import { LOCALE_NAMESPACE, createTranslate } from '../shared/i18n.ts'
import { createOverlayController, BoardNavEntry, BoardOverlay } from './overlay.tsx'
import type { AnswerQuestion } from './QuestionCard.tsx'
import type { AnswerBatch } from '../shared/types.ts'
import { createBoardStore, loadPublishedConfig, type BoardStore, type CollapseStorage } from './store.ts'
import type { SessionListLike } from './session-source.ts'
import enFile from '../../locale/en.json'
import zhFile from '../../locale/zh.json'

/**
 * Services the Client half requires; Cordis waits for all of them.
 *
 * `uiWorkspace` is deliberately NOT here: it is optional, and its absence only
 * removes the rows' "open" affordance (see `resolveNavigation`).
 */
export const inject = ['slots', 'sessions', 'locale']

/** The Harness locale service face, mirrored structurally. */
export interface LocaleService {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

/** The Harness `sessions` service face, mirrored structurally. */
export interface SessionsService {
  readonly list: {
    getSnapshot(): SessionListLike
    subscribe(listener: () => void): () => void
  }
}

/**
 * The Client navigation service that actually opens a Session.
 *
 * `sessions` has no `open` method — the shipped navigation lives on
 * `uiWorkspace.openSession`, which selects the Session and shows its
 * Conversation as one action. Optional: without it, rows stay static.
 */
export interface WorkspaceNavigationService {
  openSession(sessionId: string): void
}

/** The Cordis client context slice this module uses. */
export interface ClientContext {
  readonly slots: {
    register(options: Record<string, unknown>, component: unknown): () => void
    inject(key: string, callback: () => () => void): () => void
  }
  readonly sessions: SessionsService
  readonly locale: LocaleService
  get(name: string): unknown
  effect(callback: () => unknown, label?: string): unknown
  /**
   * Wait for optional services on a child context. Used for the answer Remote:
   * the board must keep working when a composition disables user-questions.
   */
  inject(keys: readonly string[], callback: (ctx: { get(name: string): unknown }) => void, label?: string): unknown
}

/**
 * Read the browser's `localStorage` without assuming it is available.
 *
 * A probe write decides availability: some embeddings expose the object but
 * throw on `setItem` (private mode, blocked third-party storage), and a failure
 * at first toggle would otherwise lose the click.
 */
export function browserStorage(): CollapseStorage | undefined {
  try {
    const storage = globalThis.localStorage
    if (storage === undefined || storage === null) return undefined
    const probe = '__dsh_status_board_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    // Private mode or a non-browser host: the board keeps its collapse state in
    // memory for the page lifetime instead of failing to render.
    return undefined
  }
}

/**
 * Flatten a nested locale file into the flat dictionary the Harness locale
 * service stores (its `register(ns, locale, dict)` takes `Record<string, string>`;
 * the JSON resources stay nested for readability and for the Plugin Manager's
 * `meta.*` lookup).
 */
export function flattenDictionary(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof value !== 'object' || value === null) return out
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof child === 'string') {
      out[path] = child
    } else if (typeof child === 'object' && child !== null) {
      Object.assign(out, flattenDictionary(child, path))
    }
  }
  return out
}

/**
 * Activate the Client half.
 *
 * @param ctx - the Cordis client context.
 */
export function apply(ctx: ClientContext): void {
  // ── Locale dictionaries ───────────────────────────────────────────────────
  // Registering through the service keeps the Harness language switch and the
  // panel copy in sync. The panel also translates locally, so it renders
  // correctly from the very first paint.
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NAMESPACE, 'zh', flattenDictionary(zhFile))
    const offEn = ctx.locale.register(LOCALE_NAMESPACE, 'en', flattenDictionary(enFile))
    return () => {
      offZh()
      offEn()
    }
  }, 'status-board: dictionaries')

  // ── Store ─────────────────────────────────────────────────────────────────
  const storage = browserStorage()
  const store: BoardStore = createBoardStore({
    sessions: ctx.sessions,
    locale: ctx.locale,
    ...(storage !== undefined ? { storage } : {}),
    loadConfig: () => loadPublishedConfig(globalThis.fetch),
  })
  ctx.effect(() => () => store.dispose(), 'status-board: store')

  // ── Navigation ────────────────────────────────────────────────────────────
  // Resolved per render (not captured here): `uiWorkspace` may mount after this
  // plugin, and a boolean computed at apply time would permanently render rows
  // as static text on such a composition.
  const resolveNavigation = (): ((sessionId: string) => void) | undefined => {
    const navigation = ctx.get('uiWorkspace') as WorkspaceNavigationService | undefined
    if (typeof navigation?.openSession !== 'function') return undefined
    return (sessionId: string) => navigation.openSession(sessionId)
  }

  // ── Slots ─────────────────────────────────────────────────────────────────
  // Two independent entry surfaces:
  //
  // 1. `sidebar.panellist`: the framework row. Its click is captured to toggle
  //    the inline tree (portaled under the row) instead of selecting a main
  //    column. The tree is navigation only.
  // 2. `shell.overlay`: a compact floating button that opens the current board
  //    as a popover. The board and the tree share the store, never the open
  //    state.
  const treeController = createOverlayController()
  const boardController = createOverlayController()

  const NavEntry = ({ size }: { size: number }): ReactElement =>
    createElement(BoardNavEntry, { tree: treeController, store, size, resolveNavigation })

  // The counts are drawn inside the tree and as the floating button's badge;
  // the framework's nav label stays plain text.
  const navLabel = (): string => createTranslate(store.getSnapshot().locale)('panel.title')

  /**
   * The Host answer RPC.
   *
   * `remote.userQuestions` is a capability of the composed profile. Waiting for
   * it on a child context (instead of a hard inject on the plugin) keeps the
   * board alive when that plugin is disabled; without it the card stays
   * read-only and the row offers "open session" instead.
   */
  type UserQuestionsRemote = {
    readonly answer: (
      sessionId: string,
      callId: string,
      answer: AnswerBatch,
    ) => Promise<{ readonly ok: true; readonly value: boolean } | { readonly ok: false; readonly error: { readonly message: string } }>
  }

  let answerApi: UserQuestionsRemote | undefined
  ctx.inject(
    ['remote.userQuestions'],
    answerCtx => {
      answerApi = answerCtx.get('remote.userQuestions') as UserQuestionsRemote | undefined
    },
    'status-board: answer service',
  )

  const resolveAnswer = (): AnswerQuestion | undefined => {
    const api = answerApi
    if (api === undefined || typeof api.answer !== 'function') return undefined
    // Keep the namespace as the receiver: Remote methods are generated on the
    // namespace object and may rely on `this`.
    const answer = api.answer.bind(api)
    return async (sessionId, callId, batch) => {
      const result = await answer(sessionId, callId, batch)
      if (!result.ok) throw new Error(result.error.message)
      if (!result.value) throw new Error('the question is no longer answerable')
    }
  }

  const Overlay = (): ReactElement | null =>
    createElement(BoardOverlay, {
      controller: boardController,
      store,
      resolveNavigation,
      answerQuestion: resolveAnswer(),
    })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'status-board', order: 20, label: navLabel }, NavEntry),
  )

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'status-board', order: 20 }, Overlay),
  )
}
