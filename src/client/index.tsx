/**
 * Client half of dsh-plugin-status-board.
 *
 * It contributes three things to the Harness Web UI:
 *
 * 1. A **sidebar panel icon** in `sidebar.panellist` — the shipped seat for
 *    global panel icons. A list registration's `id` is what the main column
 *    dispatches on, so the icon and the panel share one id.
 * 2. The **panel body** in `main`, keyed by that same id. The main slot binds no
 *    Session to a non-`conversation` key, which is exactly right: the board is
 *    cross-session by design.
 * 3. The **locale dictionaries**, registered through the locale service so the
 *    Harness language switch and the panel copy move together.
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
  // Shape A: the entry is a row in the sidebar nav list, directly under the
  // shipped rows, and the board opens as a frame-wide floating panel.
  //
  // The nav row's button belongs to the framework, which normally makes a click
  // select a main column. `BoardNavEntry` captures that click on the row before
  // the shell sees it, so the row opens the board instead of navigating — and no
  // main-column registration is needed.
  //
  // `sidebar.workspaces` is deliberately NOT used: its catalog says "declaring
  // is claiming" and the shipped `sidebar` entry claims it for the workspace
  // browser, so a module cannot be inserted there — and shadowing it would
  // delete the workspace list, its search box, and the new-session control.
  const controller = createOverlayController()

  const NavEntry = ({ size }: { size: number }): ReactElement =>
    createElement(BoardNavEntry, { controller, store, size })

  // The counts are drawn by `BoardOverlay` as a badge pinned to this row's right
// edge: the framework renders the label as plain text, so a coloured readout
// cannot live inside it.
  const navLabel = (): string => createTranslate(store.getSnapshot().locale)('panel.title')

  const Overlay = (): ReactElement | null =>
    createElement(BoardOverlay, { controller, store, resolveNavigation })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'status-board', order: 20, label: navLabel }, NavEntry),
  )

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'status-board', order: 20 }, Overlay),
  )
}
