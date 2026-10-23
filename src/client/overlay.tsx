/**
 * The sidebar entry and its floating board.
 *
 * Shape A (chosen from the rendered option board): the entry is a *readout* in
 * the sidebar nav list, directly under the shipped rows, showing the three
 * board counts. Opening it shows the board as a frame-wide floating panel.
 *
 * Where the numbers come from: the sidebar's nav rows are rendered by the
 * framework from `sidebar.panellist`, and a click there normally selects a main
 * column. This plugin has no main column, so its icon component captures the
 * pointer and opens the floating board instead — which is why the entry can sit
 * in the nav list and still not navigate anywhere.
 *
 * The counts live in the entry's own `label` thunk? No: the framework draws the
 * label as plain text. So the numbers ride in the accessible name and as a
 * trailing badge drawn inside the icon cell, which is the only part this plugin
 * renders.
 *
 * Accessibility (WAI-ARIA disclosure/popover pattern):
 * - the trigger is a real `<button>` carrying `aria-expanded` and `aria-controls`;
 * - the panel is a labelled `dialog` that takes focus when it opens, so a
 *   keyboard user is not left behind on the trigger;
 * - closing returns focus to the trigger, so the next Tab continues where the
 *   user was rather than at the top of the document.
 * @module dsh-plugin-status-board/client/overlay
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react'
import { createTranslate } from '../shared/i18n.ts'
import type { BoardStore } from './store.ts'
import { BoardGlyph, BoardPanel } from './Panel.tsx'

/**
 * Open/closed state for the floating board.
 *
 * A tiny observable rather than React state because the trigger and the panel
 * are two separate slot registrations: they have no common React parent, so the
 * state has to live above both. `getSnapshot` returns a primitive, which keeps
 * `useSyncExternalStore` from re-rendering on every read.
 */
export interface OverlayController {
  subscribe(listener: () => void): () => void
  getSnapshot(): boolean
  toggle(): void
  close(): void
}

/** Create one controller; `apply` owns it for the module's lifetime. */
export function createOverlayController(): OverlayController {
  let open = false
  const listeners = new Set<() => void>()
  const publish = (next: boolean): void => {
    if (open === next) return
    open = next
    for (const listener of listeners) listener()
  }
  return {
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => open,
    toggle: () => publish(!open),
    close: () => publish(false),
  }
}

/**
 * The sidebar-nav entry.
 *
 * Shape A: the entry sits in the nav list, directly under the shipped rows, and
 * reads out the three board counts. Opening it shows the board as a frame-wide
 * floating panel.
 *
 * The one hard part: `sidebar.panellist` rows are rendered by the framework, and
 * a click there normally selects a main column. This plugin has no main column,
 * so the component (which the framework renders *inside* that row's button)
 * captures the row's click and opens the floating board instead. The capture
 * listener runs on the ancestor button itself, before the shell's own handler,
 * and marks the button so the panel's outside-click guard does not treat the
 * entry as "outside".
 *
 * Counts cannot be drawn here: this component only gets the row's icon cell. The
 * numbers therefore ride in the row's label, which `apply` builds as a thunk.
 */
export function BoardNavEntry({
  controller,
  store,
  size,
}: {
  readonly controller: OverlayController
  readonly store: BoardStore
  readonly size: number
}): ReactElement {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const iconRef = useRef<HTMLSpanElement | null>(null)

  const counts = countBoards(state)
  const panelId = `status-board-overlay-${useId()}`
  const aria = describeCounts(translate, counts)

  // Capture the row's click so it opens the board instead of navigating.
  useEffect(() => {
    const row = iconRef.current?.closest('button')
    if (row === null || row === undefined) return undefined
    // Marked so the panel's outside-click guard can tell this entry apart from
    // the rest of the page.
    row.dataset.statusBoardEntry = 'true'
    row.setAttribute('aria-expanded', String(open))
    row.setAttribute('aria-controls', panelId)
    row.setAttribute('aria-label', aria)
    row.title = aria
    const capture = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
      controller.toggle()
    }
    row.addEventListener('click', capture, true)
    return () => row.removeEventListener('click', capture, true)
  }, [controller, open, panelId, aria])

  return (
    <span ref={iconRef} className="status-board__nav-glyph" data-open={open}>
      <BoardGlyph size={size} />
    </span>
  )
}

/** The three board counts, read from the same board the panel renders. */
function countBoards(state: ReturnType<BoardStore['getSnapshot']>): Record<'decision' | 'executing' | 'recent', number> {
  const countOf = (id: 'decision' | 'executing' | 'recent'): number => {
    const board = state.board.buckets.find(candidate => candidate.id === id)
    return board === undefined ? 0 : board.entries.length
  }
  return { decision: countOf('decision'), executing: countOf('executing'), recent: countOf('recent') }
}

/** Accessible name that states every count, since the row is icon+text only. */
export function describeCounts(
  translate: ReturnType<typeof createTranslate>,
  counts: Record<'decision' | 'executing' | 'recent', number>,
): string {
  return [
    translate('panel.title'),
    `${translate('bucket.decision')} ${counts.decision}`,
    `${translate('bucket.executing')} ${counts.executing}`,
    `${translate('bucket.recent')} ${counts.recent}`,
  ].join('，')
}

/**
 * Compact count string for the nav row's label.
 *
 * The row has no slot for a badge — the framework draws the label as text — so
 * the numbers have to be part of the label. Ordered decision, executing, recent
 * and separated by a middle dot so the three figures stay distinguishable at a
 * glance without any colour.
 */
export function describeCountsShort(
  _translate: ReturnType<typeof createTranslate>,
  state: ReturnType<BoardStore['getSnapshot']>,
): string {
  const counts = countBoards(state)
  return `${counts.decision} · ${counts.executing} · ${counts.recent}`
}


/**
 * The floating board.
 *
 * `shell.overlay` is a click-through layer covering the whole frame, so this
 * root opts back into pointer events.
 *
 * Position: measured from the entry's row when it opens, so the panel appears
 * beside the row that was clicked rather than at a fixed spot in the frame. A
 * fixed anchor looked like the panel came from nowhere — the entry sits near the
 * top of the sidebar, and the first cut had it pinned to the bottom of the
 * window.
 */
export function BoardOverlay({
  controller,
  store,
  resolveNavigation,
}: {
  readonly controller: OverlayController
  readonly store: BoardStore
  readonly resolveNavigation: () => ((sessionId: string) => void) | undefined
}): ReactElement | null {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = `status-board-overlay-${useId()}`

  const close = useCallback(() => controller.close(), [controller])

  // Escape closes from anywhere: the panel is not modal, so the key must work
  // even while focus sits inside the conversation behind it.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // An outside pointer press closes the board. `pointerdown` rather than `click`
  // so the panel is gone before the press lands on the content underneath.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) === true) return
      // The entry owns its own toggle; treating its press as "outside" would
      // close and immediately reopen the panel. Both forms are checked: the
      // nav row (marked by `BoardNavEntry`) and the foot strip.
      if (
        target instanceof Element &&
        (target.closest('.status-board__trigger') !== null ||
          target.closest('.status-board__strip') !== null ||
          target.closest('[data-status-board-entry]') !== null)
      ) {
        return
      }
      close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  // Move focus into the panel on open so the disclosure is usable from the
  // keyboard; the trigger restores it on close.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Anchor the panel beside the entry row. Measured on open (and on resize)
  // because the row's position depends on the sidebar's own layout: the shipped
  // nav rows above it, the fold state, and the window height all move it.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!open) {
      setAnchor(null)
      return undefined
    }
    const place = (): void => {
      const row = document.querySelector<HTMLElement>('[data-status-board-entry]')
      if (row === null) return
      const rect = row.getBoundingClientRect()
      // Open beside the sidebar, aligned to the row's top edge. Clamped so a
      // short window cannot push the panel off the bottom.
      const panelHeight = panelRef.current?.offsetHeight ?? 360
      const maxTop = Math.max(8, window.innerHeight - panelHeight - 8)
      setAnchor({ left: Math.max(8, rect.right + 6), top: Math.min(Math.max(8, rect.top), maxTop) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  if (!open) return null

  const total = state.board.buckets.reduce((sum, bucket) => sum + bucket.entries.length, 0)

  return (
    <div
      className="status-board__overlay-root"
      // Stop a press inside the board from reaching the outside-click handler of
      // any other overlay entry.
      onMouseDown={(event: ReactMouseEvent) => event.stopPropagation()}
    >
      <div
        className="status-board__overlay"
        id={panelId}
        role="dialog"
        aria-label={translate('panel.title')}
        ref={panelRef}
        tabIndex={-1}
        // Anchored to the measured row; falls back to the layer's own padding
        // before the first measurement lands (one frame).
        style={anchor === null ? undefined : { position: 'fixed', left: anchor.left, top: anchor.top }}
      >
        <div className="status-board__overlay-bar">
          <span className="status-board__overlay-title">{translate('panel.title')}</span>
          <span className="status-board__overlay-total">{translate('summary.total', { total })}</span>
          <button
            type="button"
            className="status-board__overlay-close"
            aria-label={translate('action.close')}
            title={translate('action.close')}
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="status-board__overlay-body">
          <BoardPanel store={store} resolveNavigation={resolveNavigation} />
        </div>
      </div>
    </div>
  )
}
