/**
 * Pointer state machine for the floating entry.
 *
 * Kept apart from the component because the rules here are the ones that are hard
 * to see in a browser and easy to break by editing JSX:
 *
 * - a gesture is a click until it travels past {@link DRAG_THRESHOLD}, so a shaky
 *   hand does not turn every press into a move;
 * - a gesture that *did* become a drag must not also fire the click that the
 *   browser emits on release, or moving the entry would toggle the panel;
 * - the panel is put away when the gesture becomes a drag, not when it starts.
 *   Closing on press would make the entry impossible to use as a dismiss control:
 *   click-while-open would close and immediately reopen.
 *
 * Pointer capture is requested so the gesture survives the pointer leaving the
 * button, which happens as soon as the user drags faster than the cursor follows.
 *
 * @module dsh-plugin-status-board/client/fab-drag
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FabPosition } from './fab-geometry.ts'

/**
 * Travel, in CSS pixels, before a press counts as a drag instead of a click.
 *
 * 4px is the usual slop allowance for a deliberate click: below it a hand cannot
 * produce a meaningful displacement, above it the user clearly means to move.
 */
export const DRAG_THRESHOLD = 4

/** Step applied by one arrow-key press; Shift doubles it via the caller. */
export const KEYBOARD_STEP = 8

/** What a finished gesture turned out to be. */
export type GestureOutcome = 'click' | 'drag'

/** Callbacks the owner supplies; none of them may be a no-op by accident. */
export interface FabDragHandlers {
  /** The gesture is now a drag: the owner should put the panel away. */
  onDragStart(): void
  /**
   * The pointer moved while dragging. Receives the *unclamped* position so the
   * owner can keep the raw intent and clamp only when rendering.
   */
  onDragMove(position: FabPosition): void
  /** The gesture ended; `moved` distinguishes a drag from a click. */
  onDragEnd(position: FabPosition, moved: number): void
}

/** What {@link useFabDrag} returns: wire these onto the button. */
export interface FabDragBinding {
  readonly dragging: boolean
  /**
   * True when the click that just fired is the tail of a drag and must be ignored.
   * The handler clears it, so it applies to exactly one click.
   */
  shouldIgnoreClick(): boolean
  onPointerDown(event: React.PointerEvent<HTMLElement>): void
  onPointerMove(event: React.PointerEvent<HTMLElement>): void
  onPointerUp(event: React.PointerEvent<HTMLElement>): void
  onPointerCancel(event: React.PointerEvent<HTMLElement>): void
}

interface DragState {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  readonly origin: FabPosition
  /** Most recent position, so the end of the gesture can persist where it landed. */
  last: FabPosition
  moved: number
  becameDrag: boolean
}

/**
 * Track one drag gesture on the entry.
 *
 * @param readPosition - current on-screen position, read at press time so the drag
 *   starts from wherever the entry actually is (including after a clamp).
 * @param handlers - callbacks fired as the gesture progresses.
 */
export function useFabDrag(
  readPosition: () => FabPosition,
  handlers: FabDragHandlers,
): FabDragBinding {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const ignoreClickRef = useRef(false)

  // Handlers are read through a ref: the owner re-creates them on every render
  // (they close over props), but the gesture must keep using one consistent set
  // for its whole duration.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      // Secondary mouse buttons open context menus; only the primary one drags.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const target = event.currentTarget
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: readPosition(),
        last: readPosition(),
        moved: 0,
        becameDrag: false,
      }
      ignoreClickRef.current = false
      // Without capture the gesture dies the moment the pointer leaves the button.
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // Non-fatal: the drag still works while the pointer stays over the entry.
      }
      // Never start a native text selection or image drag mid-gesture.
      event.preventDefault()
    },
    [readPosition],
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy))

    if (!drag.becameDrag) {
      if (drag.moved <= DRAG_THRESHOLD) return
      // Crossing the threshold is the moment this stops being a click. This is
      // also where the panel is dismissed - see the note at the top of the module.
      drag.becameDrag = true
      setDragging(true)
      handlersRef.current.onDragStart()
    }
    drag.last = { left: drag.origin.left + dx, top: drag.origin.top + dy }
    handlersRef.current.onDragMove(drag.last)
  }, [])

  const endGesture = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || event.pointerId !== drag.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Capture may already be gone; nothing to release.
    }
    // A drag suppresses exactly one click, the one the browser is about to emit.
    ignoreClickRef.current = drag.becameDrag
    // The final position is `last`, not `origin`: the caller persists where the
    // gesture ended, not where it started.
    handlersRef.current.onDragEnd(drag.last, drag.moved)
  }, [])

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => endGesture(event),
    [endGesture],
  )
  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => endGesture(event),
    [endGesture],
  )

  const shouldIgnoreClick = useCallback((): boolean => {
    const ignore = ignoreClickRef.current
    ignoreClickRef.current = false
    return ignore
  }, [])

  return { dragging, shouldIgnoreClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}