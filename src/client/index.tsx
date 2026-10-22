/**
 * Client half of dsh-plugin-status-board.
 *
 * It contributes three things to the Harness Web UI:
 *
 * 1. A **sidebar panel icon** in `sidebar.panellist` — the shipped seat for
 *    global panel icons. A list registration's `id` is what the main column
 *    dispatches on, so the icon and the panel share one id.
 * 2. The **panel body** in `main`, keyed by that same id. The main slot binds
 *    no Session to a non-`conversation` key, which is exactly right: the board
 *    is cross-session by design.
 * 3. The panel's **styles and dictionaries**, both owned by `apply` effects so
 *    unloading the plugin removes them again.
 *
 * Data comes from the Harness's own session list (`ctx.sessions.list`): the
 * framework already publishes it, so this half subscribes instead of polling.
 * Configuration comes from the Host half's read-only route; when that route is
 * unreachable the board renders with the documented defaults.
 *
 * `inject` is a HARD dependency list on purpose. `ctx.sessions` and `ctx.locale`
 * are shipped by the web profile, and declaring them makes Cordis hold
 * activation until both exist — reading them through `ctx.get` at apply time
 * would race the module graph and could permanently bind `undefined`.
 * @module dsh-plugin-status-board/client
 */

import { createElement, type ReactElement } from 'react'
import { LOCALE_NAMESPACE, createTranslate } from '../shared/i18n.ts'
import { BoardGlyph, BoardPanel } from './Panel.tsx'
import type { BoardStore, CollapseStorage } from './store.ts'
import { createBoardStore, loadPublishedConfig } from './store.ts'
import type { SessionListLike } from './session-source.ts'
import enFile from '../../locale/en.json'
import zhFile from '../../locale/zh.json'

/** The panel id shared by the sidebar icon and the main panel key. */
export const PANEL_ID = 'status-board'

/** Services the Client half requires; Cordis waits for all of them. */
export const inject = ['slots', 'sessions', 'locale']

/** The Harness locale service face, mirrored structurally. */
export interface LocaleService {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

/** The Harness `sessions` service face, mirrored structurally. */
export interface SessionsService {
  list: {
    getSnapshot(): SessionListLike
    subscribe(listener: () => void): () => void
  }
  open?(id: string): void
}

/** The Cordis client context slice this module uses. */
export interface ClientContext {
  slots: {
    register(options: Record<string, unknown>, component: unknown): () => void
    inject(key: string, callback: () => () => void): () => void
  }
  sessions: SessionsService
  locale: LocaleService
  effect(callback: () => unknown, label?: string): unknown
}

/**
 * Read the browser's `localStorage` without assuming it is available.
 *
 * A probe write decides availability: some embeddings expose the object but
 * throw on `setItem` (private mode, blocked third-party storage), and a
 * failure at first toggle would otherwise lose the click.
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
 * service stores (its `register(ns, locale, dict)` takes `Record<string,
 * string>`; the JSON resources stay nested for readability and for the Plugin
 * Manager's `meta.*` lookup).
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
    loadConfig: () => loadPublishedConfig(globalThis.fetch.bind(globalThis)),
  })
  ctx.effect(() => () => store.dispose(), 'status-board: store')

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open one session in the main column. */
  function openSession(sessionId: string): void {
    ctx.sessions.open?.(sessionId)
  }

  // ── Slots ─────────────────────────────────────────────────────────────────
  // The sidebar icon and the main panel share one id; that is how the shell
  // links a panellist button to the panel it selects. The shell owns the
  // button chrome and dispatches on the registration's `id`, so the icon
  // component only draws the glyph — it needs no click handler of its own.
  const panelLabel = (): string => createTranslate(ctx.locale.getSnapshot().active)('panel.title')

  const PanelComponent = (): ReactElement => createElement(BoardPanel, { store, onOpenSession: openSession })
  const IconComponent = ({ size }: { size?: number | undefined }): ReactElement =>
    createElement(BoardIcon, { size })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: panelLabel }, IconComponent),
  )

  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, PanelComponent))
}

/**
 * The sidebar panel icon.
 *
 * The owner supplies `{size, active}` and owns the button chrome, so this
 * component draws only the glyph. It is decorative: the shell derives the
 * accessible name from the registration's `label`, and the glyph itself is
 * hidden from assistive technology.
 */
function BoardIcon({ size }: { readonly size?: number | undefined }): ReactElement {
  return createElement(
    'span',
    {
      role: 'presentation',
      'aria-hidden': true,
      // Inline presentation only: this element renders in the sidebar, where
      // the panel's local stylesheet is not mounted, and the shell already
      // supplies the surrounding colour through `currentColor`.
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
    },
    createElement(BoardGlyph, { size: size ?? 18 }),
  )
}