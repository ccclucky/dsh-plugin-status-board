/**
 * The sidebar entry and its floating board (option C).
 *
 * Shape: a small action button beside Settings at the sidebar foot, and a
 * frame-wide floating board that opens above the content and closes on Escape,
 * on an outside click, or by its own close button. Nothing in the shipped
 * sidebar is replaced: `sidebar.footer.action` and `shell.overlay` are both
 * additive seats (`replaceRisk: none`), which is why this shape is safe where
 * taking over `sidebar.workspaces` was not.
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

/** Count of sessions on the decision board, for the trigger's badge. */
function decisionCount(store: BoardStore): number {
  const state = store.getSnapshot()
  const board = state.board.buckets.find(candidate => candidate.id === 'decision')
  return board === undefined ? 0 : board.entries.length
}

/**
 * The sidebar-foot trigger.
 *
 * Renders its own `<button>`: the slot supplies only `wide` (the sidebar's
 * column state), not a click handler. In the 56px rail there is no room for a
 * count, so the badge is dropped rather than allowed to overflow.
 */
export function BoardTrigger({
  controller,
  store,
  wide,
}: {
  readonly controller: OverlayController
  readonly store: BoardStore
  readonly wide: boolean
}): ReactElement {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const count = decisionCount(store)
  const panelId = `status-board-overlay-${useId()}`
  const label = translate('panel.title')

  return (
    <button
      type="button"
      className="status-board__trigger"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={count > 0 ? `${label}（${translate('bucket.decision')}: ${count}）` : label}
      title={label}
      data-open={open}
      onClick={() => controller.toggle()}
    >
      <BoardGlyph size={16} />
      {wide && count > 0 ? (
        <span className="status-board__trigger-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  )
}

/**
 * The floating board.
 *
 * `shell.overlay` is a click-through layer, so this root opts back into pointer
 * events. The panel is positioned against the sidebar's left edge and grows
 * rightwards, which keeps it near the trigger that opened it.
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
      // The trigger owns its own toggle; treating its press as "outside" would
      // close and immediately reopen the panel.
      if (target instanceof Element && target.closest('.status-board__trigger') !== null) return
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

  if (!open) return null

  const total = state.board.buckets.reduce((sum, bucket) => sum + bucket.entries.length, 0)

  return (
    <div
      className="status-board__overlay-root"
      // The layer is click-through by design; this entry claims its own pixels.
      style={{ pointerEvents: 'auto' }}
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