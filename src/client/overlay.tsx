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
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { createTranslate } from '../shared/i18n.ts'
import type { BoardState, BoardStore } from './store.ts'
import { BoardGlyph, BoardPanel, Chevron } from './Panel.tsx'
import { StatusTree } from './Tree.tsx'
import { StatusMark } from './StatusMark.tsx'
import type { AnswerQuestion } from './QuestionCard.tsx'
import { PANEL_CSS } from './styles.ts'
import {
  FAB_EDGE_MARGIN,
  FAB_PANEL_GAP,
  PANEL_EDGE_MARGIN,
  clampFabPosition,
  clearStoredFabPosition,
  nudgeFabPosition,
  readStoredFabPosition,
  resolvePanelPlacement,
  writeStoredFabPosition,
  type FabPosition,
  type FabPositionStorage,
  type PanelPlacement,
} from './fab-geometry.ts'
import { DRAG_THRESHOLD, KEYBOARD_STEP, useFabDrag } from './fab-drag.ts'
import {
  UnreadStatusContext,
  countCompletionUnread,
  useSessionStatusMap,
  type UseSessionStatus,
} from './completion-unread.ts'

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
  counts: { readonly decision: number; readonly executing: number; readonly recent: number; readonly unread?: number | undefined },
): string {
  const parts = [
    translate('panel.title'),
    `${translate('bucket.decision')} ${counts.decision}`,
  ]
  if (counts.unread !== undefined && counts.unread > 0) {
    parts.push(`${translate('bucket.unread')} ${counts.unread}`)
  }
  parts.push(`${translate('bucket.executing')} ${counts.executing}`)
  parts.push(`${translate('bucket.recent')} ${counts.recent}`)
  return parts.join('，')
}

/** Circumference of the 44px SVG ring (r = 17). */
export const DONUT_CIRCUMFERENCE = 106.814

export interface DonutSegmentArc {
  readonly strokeDasharray: string
  readonly strokeDashoffset: number
  readonly opacity: number
}

/** Compute stroke dasharray and offset for each of the 4 donut arcs (clockwise: decision -> executing -> unread -> recent). */
export function computeDonutArcs(counts: {
  readonly decision: number
  readonly executing: number
  readonly unread: number
  readonly recent: number
}): Record<'decision' | 'executing' | 'unread' | 'recent', DonutSegmentArc> {
  const total = counts.decision + counts.executing + counts.unread + counts.recent
  if (total === 0) {
    return {
      decision: { strokeDasharray: '0 106.81', strokeDashoffset: 0, opacity: 0 },
      executing: { strokeDasharray: '0 106.81', strokeDashoffset: 0, opacity: 0 },
      unread: { strokeDasharray: '0 106.81', strokeDashoffset: 0, opacity: 0 },
      recent: { strokeDasharray: '0 106.81', strokeDashoffset: 0, opacity: 0 },
    }
  }

  let offset = 0
  const seg = (count: number): DonutSegmentArc => {
    if (count <= 0) {
      return { strokeDasharray: '0 106.81', strokeDashoffset: 0, opacity: 0 }
    }
    const arc = (count / total) * DONUT_CIRCUMFERENCE
    const res: DonutSegmentArc = {
      strokeDasharray: `${arc.toFixed(2)} ${(DONUT_CIRCUMFERENCE - arc).toFixed(2)}`,
      strokeDashoffset: -offset,
      opacity: 1,
    }
    offset += arc
    return res
  }

  return {
    decision: seg(counts.decision),
    executing: seg(counts.executing),
    unread: seg(counts.unread),
    recent: seg(counts.recent),
  }
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
  useSessionStatus,
}: {
  readonly tree: OverlayController
  readonly store: BoardStore
  readonly size: number
  readonly resolveNavigation: () => ((sessionId: string) => void) | undefined
  /**
   * The platform's `useSessionStatus` slot hook, when this shell provides it.
   *
   * It arrives as a slot prop rather than a service, so it is threaded in from the
   * registration rather than obtained from `ctx`. Optional: an older shell or a test
   * renderer simply has no completion reminders.
   */
  readonly useSessionStatus?: UseSessionStatus | undefined
}): ReactElement {
  const open = useSyncExternalStore(tree.subscribe, tree.getSnapshot, tree.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  // Called unconditionally, even when the shell supplies no hook: a conditional hook
  // would change the call order between renders.
  const statusMap = useSessionStatusMap(useSessionStatus)
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
            <Chevron collapsed={!open} />
          </span>
        )}
      </span>
      {/* The tree lives in the sidebar's nav via a portal, and the inline tree is
          rendered as a child of the row only when no portal container exists. Both
          paths get the status map so their rows can show the completion reminder. */}
      {container !== null && !collapsed
        ? createPortal(
            <UnreadStatusContext.Provider value={statusMap}>
              <StatusTree store={store} onOpenSession={onOpenSession} />
            </UnreadStatusContext.Provider>,
            container,
          )
        : null}
      {fallback !== null && open && !collapsed
        ? createPortal(
            <div
              className="status-board__tree-fallback"
              style={{ position: 'fixed', left: fallback.left, top: fallback.top, width: fallback.width }}
            >
              <UnreadStatusContext.Provider value={statusMap}>
                <StatusTree store={store} onOpenSession={onOpenSession} />
              </UnreadStatusContext.Provider>
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
 * A compact button that the user may drag anywhere in the viewport opens the board
 * next to itself. Three rules shape this component:
 *
 * 1. **The entry owns the geometry.** The panel has no position of its own; it is
 *    placed from the entry's rectangle every time it opens or the entry moves.
 *    That is why dragging the entry takes the panel with it.
 * 2. **A position is remembered, never corrected.** A resize clamps what is drawn
 *    and leaves storage alone, so unplugging a monitor and plugging it back in
 *    restores the original placement instead of collapsing it to the smaller
 *    screen.
 * 3. **Dragging is not clicking.** A gesture that travels past the threshold is a
 *    move and suppresses the click that follows it; a gesture below it is a click
 *    and toggles the panel.
 *
 * The panel is a non-modal popover: Escape and an outside press close it, focus
 * moves into it on open and returns to the button on close.
 */
export function BoardOverlay({
  controller,
  store,
  resolveNavigation,
  answerQuestion,
  positionStorage,
  useSessionStatus,
}: {
  readonly controller: OverlayController
  readonly store: BoardStore
  readonly resolveNavigation: () => ((sessionId: string) => void) | undefined
  readonly answerQuestion?: AnswerQuestion | undefined
  /** Where the remembered position lives; `undefined` keeps it in memory only. */
  readonly positionStorage?: FabPositionStorage | undefined
  /** The platform's `useSessionStatus` slot hook, when the shell provides it. */
  readonly useSessionStatus?: UseSessionStatus | undefined
}): ReactElement | null {
  const open = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const statusMap = useSessionStatusMap(useSessionStatus)
  const translate = createTranslate(state.locale)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)
  const panelId = `status-board-overlay-${useId()}`
  const counts = countBoards(state)
  const recentBoard = state.board.buckets.find(b => b.id === 'recent')
  const unreadCount = countCompletionUnread(statusMap, recentBoard?.entries ?? [])
  const recentCount = Math.max(0, counts.recent - unreadCount)
  const total = counts.decision + unreadCount + counts.executing + recentCount
  const urgentCount = counts.decision + unreadCount
  const centerText = urgentCount > 0 ? urgentCount : (total > 0 ? total : 0)

  const donutArcs = computeDonutArcs({
    decision: counts.decision,
    executing: counts.executing,
    unread: unreadCount,
    recent: recentCount,
  })

  const aria = describeCounts(translate, {
    decision: counts.decision,
    unread: unreadCount,
    executing: counts.executing,
    recent: recentCount,
  })

  // ── Remembered position ────────────────────────────────────────────────────
  // `undefined` means "never dragged": the stylesheet's corner (including its
  // narrow-screen offsets) stays in charge. Only a real placement is stored, so a
  // reset can return the entry to a media-query-aware default rather than to a
  // hardcoded 16px.
  const [position, setPosition] = useState<FabPosition | undefined>(() =>
    readStoredFabPosition(positionStorage),
  )
  // Viewport size is state, not a read at call time: the clamp and the panel
  // placement both depend on it, and a resize has to re-render to be felt.
  const [viewport, setViewport] = useState(() => ({
    width: globalThis.innerWidth ?? 0,
    height: globalThis.innerHeight ?? 0,
  }))
  useEffect(() => {
    const onResize = (): void => {
      setViewport({ width: globalThis.innerWidth, height: globalThis.innerHeight })
    }
    globalThis.addEventListener('resize', onResize)
    return () => globalThis.removeEventListener('resize', onResize)
  }, [])

  const fabBox = useCallback((): { width: number; height: number; left: number; top: number } => {
    const rect = fabRef.current?.getBoundingClientRect()
    if (rect === undefined) return { width: 0, height: 0, left: 0, top: 0 }
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
  }, [])
  const readFabPosition = useCallback((): FabPosition => {
    const box = fabBox()
    return { left: box.left, top: box.top }
  }, [fabBox])

  /** Store a placement the user made. Only a deliberate move reaches this. */
  const commitPosition = useCallback(
    (next: FabPosition): void => {
      setPosition(next)
      writeStoredFabPosition(positionStorage, next)
    },
    [positionStorage],
  )

  /**
   * Whether the panel was open when the current gesture started.
   *
   * Captured on press, because by the time the gesture ends the drag has already
   * closed it. Reading `open` at release would always say "closed" and the panel
   * would never reopen after a move.
   */
  const openAtPress = useRef(false)
  const notePress = useCallback((): void => {
    openAtPress.current = controller.getSnapshot()
  }, [controller])

  // ── Drag ───────────────────────────────────────────────────────────────────
  const drag = useFabDrag(readFabPosition, {
    onDragStart: () => {
      // Crossing the threshold means "moving", so the panel goes away here rather
      // than on pointerdown - closing on press would make the entry useless as a
      // dismiss control.
      if (open) controller.close()
    },
    onDragMove: next => {
      // Unclamped on purpose: `clampFabPosition` runs at render time so the stored
      // value keeps the user's intent.
      setPosition(next)
    },
    onDragEnd: (next, moved) => {
      if (moved <= DRAG_THRESHOLD) return
      writeStoredFabPosition(positionStorage, next)
      // Reopen only if it had been open: a move must not pop the board open for
      // someone who was merely relocating the entry.
      if (openAtPress.current) controller.toggle()
    },
  })

  // ── Panel placement ────────────────────────────────────────────────────────
  // Measured, not assumed: a fixed guess leaves the panel floating away from the
  // entry whenever the board is shorter than the guess. A ResizeObserver tracks
  // content size changes (e.g. accordion/card toggles) so the panel flips or nudges
  // rather than overflowing below the viewport.
  const [placement, setPlacement] = useState<{ left: number; top: number } | undefined>(undefined)
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(undefined)
      return
    }
    const panel = panelRef.current
    if (panel === null) return

    const updatePlacement = (): void => {
      const box = fabBox()
      const rect = panel.getBoundingClientRect()
      const next = resolvePanelPlacement(
        { left: box.left, top: box.top, width: box.width, height: box.height },
        { width: rect.width, height: rect.height },
        viewport,
        FAB_PANEL_GAP,
        PANEL_EDGE_MARGIN,
      )
      setPlacement(prev =>
        prev !== undefined && prev.left === next.left && prev.top === next.top
          ? prev
          : { left: next.left, top: next.top },
      )
    }

    updatePlacement()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updatePlacement()
      })
      observer.observe(panel)
      return () => observer.disconnect()
    }
  }, [open, position, viewport, fabBox])

  // What to draw: the remembered position clamped into the viewport. Storage keeps
  // the unclamped value (see the module note).
  const drawnPosition = useMemo(() => {
    if (position === undefined) return undefined
    const box = fabBox()
    const size = box.width > 0 ? { width: box.width, height: box.height } : { width: 44, height: 44 }
    return clampFabPosition(position, size, viewport, FAB_EDGE_MARGIN)
  }, [position, viewport, fabBox])

  const resetPosition = (): void => {
    clearStoredFabPosition(positionStorage)
    setPosition(undefined)
  }

  const onFabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (direction === undefined) return
    // Arrow keys on a focused button would otherwise scroll the conversation
    // behind the entry, which looks like the panel misbehaving.
    event.preventDefault()
    const step = KEYBOARD_STEP * (event.shiftKey ? 2 : 1)
    const from = drawnPosition ?? readFabPosition()
    const next = nudgeFabPosition(from, direction[0] * step, direction[1] * step)
    commitPosition(next)
    // Keyboard users cannot drag at all, so the only way back to a sane position is
    // the reset control - which this commit has just enabled.
  }

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

  // ── Hover Tooltip placement ───────────────────────────────────────────────
  // Mirrored from the panel's geometry: if the button sits close to an edge,
  // the tooltip is nudged or flipped rather than clipped by the viewport.
  const [hovered, setHovered] = useState(false)
  const [fabFocused, setFabFocused] = useState(false)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipPlacement, setTooltipPlacement] = useState<PanelPlacement | undefined>(undefined)

  const showTooltip = !open && !drag.dragging
  const tooltipVisible = (hovered || fabFocused) && showTooltip

  useLayoutEffect(() => {
    if (!showTooltip) {
      setTooltipPlacement(undefined)
      return
    }
    const updateTooltipPlacement = (): void => {
      const box = fabBox()
      const el = tooltipRef.current
      const rect = el?.getBoundingClientRect()
      const tooltipSize =
        rect !== undefined && rect.width > 0
          ? { width: rect.width, height: rect.height }
          : { width: 175, height: 145 }

      const next = resolvePanelPlacement(
        { left: box.left, top: box.top, width: box.width, height: box.height },
        tooltipSize,
        viewport,
        FAB_PANEL_GAP,
        PANEL_EDGE_MARGIN,
      )
      setTooltipPlacement(prev =>
        prev !== undefined && prev.left === next.left && prev.top === next.top && prev.opensUp === next.opensUp
          ? prev
          : next,
      )
    }

    updateTooltipPlacement()
  }, [showTooltip, viewport, fabBox, drawnPosition])

  const clamped = drawnPosition
  const fabStyle =
    clamped === undefined
      ? undefined
      : { left: `${clamped.left}px`, top: `${clamped.top}px`, right: 'auto', bottom: 'auto' }

  return (
    <UnreadStatusContext.Provider value={statusMap}>
      <style>{PANEL_CSS}</style>
      <button
        ref={fabRef}
        type="button"
        className={drag.dragging ? 'status-board__fab status-board__fab--dragging' : 'status-board__fab'}
        style={fabStyle}
        aria-label={aria}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={aria}
        data-dragging={drag.dragging ? 'true' : 'false'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFabFocused(true)}
        onBlur={() => setFabFocused(false)}
        onPointerDown={event => {
          notePress()
          drag.onPointerDown(event)
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onKeyDown={onFabKeyDown}
        onClick={() => {
          // The click a drag leaves behind must not toggle the panel.
          if (drag.shouldIgnoreClick()) return
          controller.toggle()
        }}
      >
        <svg className="status-board__fab-svg" viewBox="0 0 44 44" aria-hidden="true">
          <circle className="status-board__fab-track" cx="22" cy="22" r="17" />
          <circle
            className="status-board__fab-seg status-board__fab-seg--decision"
            cx="22"
            cy="22"
            r="17"
            style={{
              strokeDasharray: donutArcs.decision.strokeDasharray,
              strokeDashoffset: `${donutArcs.decision.strokeDashoffset}px`,
              opacity: donutArcs.decision.opacity,
            }}
          />
          <circle
            className="status-board__fab-seg status-board__fab-seg--executing"
            cx="22"
            cy="22"
            r="17"
            style={{
              strokeDasharray: donutArcs.executing.strokeDasharray,
              strokeDashoffset: `${donutArcs.executing.strokeDashoffset}px`,
              opacity: donutArcs.executing.opacity,
            }}
          />
          <circle
            className="status-board__fab-seg status-board__fab-seg--unread"
            cx="22"
            cy="22"
            r="17"
            style={{
              strokeDasharray: donutArcs.unread.strokeDasharray,
              strokeDashoffset: `${donutArcs.unread.strokeDashoffset}px`,
              opacity: donutArcs.unread.opacity,
            }}
          />
          <circle
            className="status-board__fab-seg status-board__fab-seg--recent"
            cx="22"
            cy="22"
            r="17"
            style={{
              strokeDasharray: donutArcs.recent.strokeDasharray,
              strokeDashoffset: `${donutArcs.recent.strokeDashoffset}px`,
              opacity: donutArcs.recent.opacity,
            }}
          />
        </svg>
        <span className="status-board__fab-center" aria-hidden="true">
          {centerText}
        </span>

        {/* Hover Tooltip breakdown: dynamically positioned and edge-clamped */}
        {showTooltip ? (
          <div
            ref={tooltipRef}
            className="status-board__fab-tooltip"
            style={
              tooltipPlacement === undefined
                ? { position: 'fixed', opacity: 0, visibility: 'hidden', pointerEvents: 'none' }
                : {
                    position: 'fixed',
                    left: `${tooltipPlacement.left}px`,
                    top: `${tooltipPlacement.top}px`,
                    right: 'auto',
                    bottom: 'auto',
                    opacity: tooltipVisible ? 1 : 0,
                    visibility: tooltipVisible ? 'visible' : 'hidden',
                    pointerEvents: tooltipVisible ? 'auto' : 'none',
                  }
            }
            data-placement={tooltipPlacement?.opensUp === true ? 'top' : 'bottom'}
            data-visible={tooltipVisible ? 'true' : 'false'}
            role="tooltip"
            aria-hidden={!tooltipVisible}
          >
            <div className="status-board__fab-tooltip-head">
              <span>{translate('panel.shortTitle')}</span>
              <span>{translate('summary.total', { total })}</span>
            </div>
            <div className="status-board__fab-tooltip-list">
              <div className="status-board__fab-row" data-bucket="decision">
                <span className="status-board__fab-group">
                  <StatusMark bucket="decision" variant="folder" empty={counts.decision === 0} />
                  <span>{translate('bucket.decision')}</span>
                </span>
                <span className="status-board__fab-count" data-empty={counts.decision === 0}>
                  {counts.decision}
                </span>
              </div>
              <div className="status-board__fab-row" data-bucket="executing">
                <span className="status-board__fab-group">
                  <StatusMark bucket="executing" variant="folder" empty={counts.executing === 0} />
                  <span>{translate('bucket.executing')}</span>
                </span>
                <span className="status-board__fab-count" data-empty={counts.executing === 0}>
                  {counts.executing}
                </span>
              </div>
              <div className="status-board__fab-row" data-bucket="unread">
                <span className="status-board__fab-group">
                  <StatusMark bucket="unread" variant="folder" empty={unreadCount === 0} />
                  <span>{translate('bucket.unread')}</span>
                </span>
                <span className="status-board__fab-count" data-empty={unreadCount === 0}>
                  {unreadCount}
                </span>
              </div>
              <div className="status-board__fab-row" data-bucket="recent">
                <span className="status-board__fab-group">
                  <StatusMark bucket="recent" variant="folder" empty={recentCount === 0} />
                  <span>{translate('bucket.recent')}</span>
                </span>
                <span className="status-board__fab-count" data-empty={recentCount === 0}>
                  {recentCount}
                </span>
              </div>
            </div>
          </div>
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
          style={
            placement === undefined
              ? undefined
              : { left: `${placement.left}px`, top: `${placement.top}px`, right: 'auto', bottom: 'auto' }
          }
        >
          <div className="status-board__overlay-bar">
            <div className="status-board__overlay-heading">
              <span className="status-board__overlay-title">{translate('panel.shortTitle')}</span>
              <span className="status-board__overlay-subtitle">{translate('summary.total', { total })}</span>
            </div>
            {/* Reset lives here rather than in the board's own head, which is
                hidden inside the overlay (the bar already carries the title).
                Disabled until the entry has actually been moved: a control that
                can never do anything is noise. */}
            <button
              type="button"
              className="status-board__overlay-reset"
              aria-label={translate('action.resetPosition')}
              title={translate('action.resetPosition')}
              disabled={position === undefined}
              onClick={resetPosition}
            >
              {/* Return-to-corner arrow: the button's only job is putting the entry
                  back in its default corner, so the glyph points there instead of
                  using a generic undo arc that reads as a time operation. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 5l10 10" />
                <path d="M15 9.5V15h-5.5" />
                <path d="M19 14v5h-5" />
              </svg>
            </button>
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
    </UnreadStatusContext.Provider>
  )
}
