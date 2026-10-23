/**
 * The two entry surfaces.
 *
 * Entry ① is the sidebar row: its click expands a real, inline status tree
 * (ported into the sidebar's `nav`) and never navigates. Entry ② is a compact
 * floating button: clicking it opens the current board as a popover.
 *
 * Both surfaces are separate slot registrations with no shared React parent, so
 * the open state lives in small external controllers and is read through
 * `useSyncExternalStore`. The tree and the board share the store, not state:
 * each controller owns its own open/closed bit.
 *
 * @module dsh-plugin-status-board/client/overlay
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { createTranslate } from '../shared/i18n.ts'
import type { BoardState, BoardStore } from './store.ts'
import { BoardGlyph, BoardPanel } from './Panel.tsx'
import { StatusTree } from './Tree.tsx'
import type { AnswerQuestion } from './QuestionCard.tsx'
import { PANEL_CSS } from './styles.ts'

/**
 * Open/closed state for one disclosure surface.
 *
 * A tiny observable rather than React state because the trigger and the panel
 * are separate slot registrations (or, for the tree, a portal target outside
 * React's managed children). `getSnapshot` returns a primitive, which keeps
 * `useSyncExternalStore` from re-rendering on every read.
 */
export interface OverlayController {
  subscribe(listener: () => void): () => void
  getSnapshot(): boolean
  toggle(): void
  close(): void
}

/** Create one controller; `apply` owns one per surface for the module lifetime. */
export function createOverlayController(initial = false): OverlayController {
  let open = initial
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

/** The three board counts, read from the same board the panel renders. */
function countBoards(state: BoardState): Record<'decision' | 'executing' | 'recent', number> {
  const countOf = (id: 'decision' | 'executing' | 'recent'): number => {
    const board = state.board.buckets.find(candidate => candidate.id === id)
    return board === undefined ? 0 : board.entries.length
  }
  return { decision: countOf('decision'), executing: countOf('executing'), recent: countOf('recent') }
}

/** Accessible name that states every count, since the trigger is icon+text only. */
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

/** Find the direct child of `nav` that contains `row`, if one exists. */
function directChildOf(nav: HTMLElement, row: HTMLElement): HTMLElement | null {
  let cursor: HTMLElement | null = row
  while (cursor !== null && cursor.parentElement !== nav) cursor = cursor.parentElement
  return cursor
}

/** Insert the tree container after the row's nav child, or append it. */
function insertTree(nav: HTMLElement, container: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor !== null && anchor.parentElement === nav) nav.insertBefore(container, anchor.nextSibling)
  else nav.append(container)
}

/**
 * The sidebar-nav entry (entry ①).
 *
 * The framework renders this component inside its own nav-row button and gives
 * the plugin only the icon cell. The row's click is captured to toggle the tree
 * and to stop the shell from selecting a main column.
 *
 * The tree itself has no nested slot: it is a portal into the sidebar's
 * `nav.panelList`, inserted after this row. If that DOM cannot be found (a
 * future shell change), the same tree is rendered as a fixed panel under the
 * row instead of silently disappearing.
 */
export function BoardNavEntry({
  tree,
  store,
  size,
  resolveNavigation,
}: {
  readonly tree: OverlayController
  readonly store: BoardStore
  readonly size: number
  readonly resolveNavigation: () => ((sessionId: string) => void) | undefined
}): ReactElement {
  const open = useSyncExternalStore(tree.subscribe, tree.getSnapshot, tree.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const iconRef = useRef<HTMLSpanElement | null>(null)
  const warned = useRef(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [fallback, setFallback] = useState<{ left: number; top: number; width: number } | null>(null)

  // The shell passes size 18 for the collapsed rail and 16 for the wide column.
  // Keeping the tree out of the rail is deliberate: 56px cannot show a nested
  // list, and the row's click then only prevents a dead navigation.
  const collapsed = size >= 18
  const counts = countBoards(state)
  const treeId = `status-board-tree-${useId()}`
  const aria = describeCounts(translate, counts)

  // Capture the framework row's click: it must not navigate. In the collapsed
  // rail there is no room for the tree, so the click is simply swallowed.
  useEffect(() => {
    const row = iconRef.current?.closest('button')
    if (row === null || row === undefined) return undefined
    row.dataset.statusBoardEntry = 'true'
    row.title = aria
    row.setAttribute('aria-label', aria)
    const previousPosition = row.style.position
    const previousPaddingRight = row.style.paddingRight
    if (collapsed) {
      row.removeAttribute('aria-expanded')
      row.removeAttribute('aria-controls')
    } else {
      row.setAttribute('aria-expanded', String(open))
      row.setAttribute('aria-controls', treeId)
      // Reserve room for the right-edge chevron drawn inside this component.
      row.style.position = 'relative'
      row.style.paddingRight = '24px'
    }
    const capture = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
      if (!collapsed) tree.toggle()
    }
    row.addEventListener('click', capture, true)
    return () => {
      row.removeEventListener('click', capture, true)
      delete row.dataset.statusBoardEntry
      row.removeAttribute('aria-expanded')
      row.removeAttribute('aria-controls')
      row.removeAttribute('aria-label')
      row.removeAttribute('title')
      row.style.position = previousPosition
      row.style.paddingRight = previousPaddingRight
    }
  }, [aria, collapsed, open, tree, treeId])

  // Close the tree when the column collapses; the rail cannot show it.
  useEffect(() => {
    if (collapsed) tree.close()
  }, [collapsed, tree])

  // Insert one container after the row's nav child and portal the tree into it.
  useEffect(() => {
    if (collapsed) {
      setContainer(null)
      setFallback(null)
      return undefined
    }
    const row = iconRef.current?.closest('button')
    if (row === null || row === undefined) return undefined
    const nav = row.closest('nav')
    if (nav === null) {
      // Degraded but usable: a fixed panel under the row. The real app's
      // sidebar always renders a nav today; this branch keeps a future shell
      // change from turning the tree into a no-op.
      if (!warned.current) {
        warned.current = true
        console.warn('[dsh-plugin-status-board] sidebar nav not found; using the anchored tree fallback')
      }
      return undefined
    }

    const box = document.createElement('div')
    box.className = 'status-board__tree-portal'
    box.id = treeId
    box.hidden = true
    box.dataset.statusBoardTree = 'true'
    const anchor = directChildOf(nav, row)
    insertTree(nav, box, anchor)

    // React does not own this node. If the shell reconciles the nav and drops
    // it, put it back; if the whole row is gone, the component unmounts and the
    // cleanup below removes the box.
    const observer = new MutationObserver(() => {
      if (!box.isConnected) insertTree(nav, box, anchor?.isConnected === true ? anchor : null)
    })
    observer.observe(nav, { childList: true })
    setContainer(box)

    return () => {
      observer.disconnect()
      box.remove()
      setContainer(null)
    }
  }, [collapsed, treeId])

  // Hiding the box (rather than unmounting it) keeps `aria-controls` resolving.
  useEffect(() => {
    if (container !== null) container.hidden = !open
  }, [container, open])

  // The fallback has no portal container to measure against. Measure when it
  // actually opens, after layout, so a jsdom/zero-box first frame does not pin
  // it to the window origin forever.
  useEffect(() => {
    if (collapsed || container !== null || !open) {
      setFallback(null)
      return
    }
    const row = iconRef.current?.closest('button')
    if (row === null || row === undefined) return
    if (row.closest('nav') !== null) return
    const rect = row.getBoundingClientRect()
    if (rect.width === 0) return
    setFallback({ left: rect.left, top: rect.bottom + 4, width: rect.width })
  }, [collapsed, container, open])

  const onOpenSession = resolveNavigation()

  return (
    <>
      <span ref={iconRef} className="status-board__nav-glyph" data-open={open}>
        <BoardGlyph size={size} />
        {collapsed ? null : (
          <span className="status-board__nav-chevron" data-open={open} aria-hidden="true">
            ▾
          </span>
        )}
      </span>
      {container !== null && !collapsed ? createPortal(<StatusTree store={store} onOpenSession={onOpenSession} />, container) : null}
      {fallback !== null && open && !collapsed
        ? createPortal(
            <div
              className="status-board__tree-fallback"
              style={{ position: 'fixed', left: fallback.left, top: fallback.top, width: fallback.width }}
            >
              <StatusTree store={store} onOpenSession={onOpenSession} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * The floating board (entry ②).
 *
 * A compact button fixed to the bottom-right corner opens the board above it.
 * The panel is a non-modal popover: Escape and an outside press close it,
 * focus moves into it on open and returns to the button on close.
 */
export function BoardOverlay({
  controller,
  store,
  resolveNavigation,
  answerQuestion,
}: {
  readonly controller: OverlayController
  readonly store: BoardStore
  readonly resolveNavigation: () => ((sessionId: string) => void) | undefined
  readonly answerQuestion?: AnswerQuestion | undefined
}): ReactElement | null {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)
  const panelId = `status-board-overlay-${useId()}`
  const counts = countBoards(state)
  const aria = describeCounts(translate, counts)

  // Escape closes from anywhere: the popover is not modal, so the key must work
  // even while focus sits inside the conversation behind it.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') controller.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [controller, open])

  // An outside pointer press closes the board. `pointerdown` rather than `click`
  // so the panel is gone before the press lands on the content underneath.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) === true) return
      if (fabRef.current?.contains(target) === true) return
      controller.close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [controller, open])

  // Move focus into the panel on open, and back to the button on close. The
  // `wasOpen` guard avoids stealing focus on the initial closed render.
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      panelRef.current?.focus()
      return
    }
    if (wasOpen.current) {
      wasOpen.current = false
      fabRef.current?.focus()
    }
  }, [open])

  const total = state.board.buckets.reduce((sum, bucket) => sum + bucket.entries.length, 0)

  return (
    <>
      <style>{PANEL_CSS}</style>
      <button
        ref={fabRef}
        type="button"
        className="status-board__fab"
        aria-label={aria}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={aria}
        onClick={() => controller.toggle()}
      >
        <BoardGlyph size={18} />
        {counts.decision > 0 ? (
          <span className="status-board__fab-badge" aria-hidden="true">
            {counts.decision}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="status-board__overlay status-board__overlay--fab"
          id={panelId}
          role="dialog"
          aria-label={translate('panel.title')}
          ref={panelRef}
          tabIndex={-1}
        >
          <div className="status-board__overlay-bar">
            <span className="status-board__overlay-title">{translate('panel.shortTitle')}</span>
            <span className="status-board__overlay-total" aria-label={translate('summary.total', { total })}>
              {total}
            </span>
            <button
              type="button"
              className="status-board__overlay-close"
              aria-label={translate('action.close')}
              title={translate('action.close')}
              onClick={() => controller.close()}
            >
              ×
            </button>
          </div>
          <div className="status-board__overlay-body">
            <BoardPanel store={store} resolveNavigation={resolveNavigation} answerQuestion={answerQuestion} />
          </div>
        </div>
      ) : null}
    </>
  )
}
