/**
 * Entry ②: the floating button and its board popover.
 *
 * These cover the behaviours a user can hit — toggling, Escape, an outside
 * press, focus movement, and the decision badge — because a popover that opens
 * but cannot be dismissed is worse than no popover.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BoardOverlay, createOverlayController } from '../src/client/overlay.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import { FAB_POSITION_STORAGE_KEY } from '../src/client/fab-geometry.ts'
import type { BoardState, BoardStore, CollapseStorage } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function signal(id: string, extra: Partial<SessionSignal> = {}): SessionSignal {
  return { id, title: id, running: false, awaitingDecision: false, lastActivityAt: NOW, ...extra }
}

function makeStore(signals: readonly SessionSignal[]): BoardStore {
  const state: BoardState = {
    status: 'ready',
    board: buildBoard(signals, { ...CONFIG_DEFAULTS, recentWindowHours: 24, maxRecent: 20 }, NOW),
    config: CONFIG_DEFAULTS,
    collapse: { decision: false, executing: false, recent: false },
    locale: 'en',
  } as unknown as BoardState
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    toggle: () => {},
    dispose: () => {},
  } as unknown as BoardStore
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount())
    entry.container.remove()
  }
})

function mount(
  store: BoardStore,
  controller = createOverlayController(),
  options: { readonly positionStorage?: CollapseStorage } = {},
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(BoardOverlay, {
        controller,
        store,
        resolveNavigation: () => undefined,
        ...(options.positionStorage !== undefined ? { positionStorage: options.positionStorage } : {}),
      }),
    )
  })
  mounted.push({ root, container })
  return { container, controller }
}

/**
 * Give the entry a real box.
 *
 * jsdom reports every rect as zero, and the drag reads the button's rectangle at
 * press time - without a box the gesture would start from (0,0) and the assertions
 * below would pass for the wrong reason.
 */
function stubFabRect(fab: HTMLElement, box = { left: 1100, top: 700, width: 129, height: 34 }): void {
  fab.getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect
}

/** Dispatch one pointer event of the gesture, with React's synthetic path. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, target: HTMLElement): void {
  const MutablePointerEvent = globalThis.PointerEvent as unknown as new (
    type: string,
    init: Record<string, unknown>,
  ) => Event
  act(() => {
    target.dispatchEvent(
      new MutablePointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }),
    )
  })
}

describe('createOverlayController', () => {
  it('starts closed and toggles', () => {
    const controller = createOverlayController()
    expect(controller.getSnapshot()).toBe(false)
    controller.toggle()
    expect(controller.getSnapshot()).toBe(true)
    controller.toggle()
    expect(controller.getSnapshot()).toBe(false)
  })

  it('notifies subscribers only on an actual change', () => {
    const controller = createOverlayController()
    let calls = 0
    controller.subscribe(() => {
      calls += 1
    })
    controller.close()
    expect(calls).toBe(0)
    controller.toggle()
    expect(calls).toBe(1)
  })
})

describe('BoardOverlay (entry ②)', () => {
  it('shows a floating button but no dialog while closed', () => {
    const { container } = mount(makeStore([]))
    expect(container.querySelector('.status-board__fab')).not.toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('style')).not.toBeNull()
  })

  it('shows the segmented donut ring and status tooltip with markers and tallies', () => {
    const { container } = mount(makeStore([signal('d', { awaitingDecision: true })]))
    // The entry renders a circular segmented donut with central text and tooltip.
    expect(container.querySelector('.status-board__fab-svg')).not.toBeNull()
    expect(container.querySelector('.status-board__fab-center')?.textContent).toBe('1')
    expect(container.querySelector('.status-board__fab-tooltip')).not.toBeNull()

    // The tooltip lists the four statuses with folder markers
    const marks = container.querySelectorAll('.status-board__fab .status-board-status')
    expect(marks).toHaveLength(4)
    expect([...marks].map(m => m.getAttribute('data-bucket'))).toEqual(['decision', 'unread', 'executing', 'recent'])
    expect([...marks].every(m => m.getAttribute('data-variant') === 'folder')).toBe(true)

    // The decision tally reflects the board, and its marker is not dimmed.
    const counts = [...container.querySelectorAll('.status-board__fab-count')]
    expect(counts.map(c => c.textContent)).toEqual(['1', '0', '0', '0'])
    expect(counts[0]?.getAttribute('data-empty')).toBe('false')
    // Zeros keep their markers but are marked empty, matching the tree.
    expect(counts[1]?.getAttribute('data-empty')).toBe('true')
    expect(marks[1]?.getAttribute('data-empty')).toBe('true')
    expect(container.querySelector('.status-board__fab')?.getAttribute('aria-label')).toContain('Needs my decision 1')
  })

  it('keeps all four statuses visible in the tooltip even when empty', () => {
    const { container } = mount(makeStore([]))
    expect(container.querySelectorAll('.status-board__fab-group')).toHaveLength(4)
  })

  it('offers a reset control that is disabled until the entry has been moved', () => {
    const { container } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const reset = container.querySelector<HTMLButtonElement>('.status-board__overlay-reset')
    expect(reset).not.toBeNull()
    // At the default corner there is nothing to reset, so the control is inert.
    expect(reset?.disabled).toBe(true)

    // It draws a glyph rather than a text character: a compass or undo symbol comes
    // from the OS font and reads as "expand" instead of "back to the corner".
    expect(reset?.querySelector('svg')).not.toBeNull()
    expect(reset?.textContent).toBe('')
    expect(reset?.getAttribute('aria-label')).toBe('Reset position')
  })

  it('moves the entry with the arrow keys and enables the reset control', () => {
    const { container } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const before = container.querySelector<HTMLButtonElement>('.status-board__fab')?.style.left
    act(() => {
      fab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    const moved = container.querySelector<HTMLButtonElement>('.status-board__fab')
    expect(moved?.style.left).not.toBe(before)
    // Keyboard users cannot drag at all, so this is their only route to a position;
    // it must enable the very control that undoes it.
    expect(container.querySelector<HTMLButtonElement>('.status-board__overlay-reset')?.disabled).toBe(false)
  })

  it('ignores keys that are not arrows so typing in the board still works', () => {
    const { container } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      fab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    expect(container.querySelector<HTMLButtonElement>('.status-board__fab')?.style.left).toBe('')
  })

  it('opens and closes from the floating button', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    expect(fab?.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(controller.getSnapshot()).toBe(true)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.status-board__fab')?.getAttribute('aria-expanded')).toBe('true')
    act(() => {
      container.querySelector<HTMLButtonElement>('.status-board__fab')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on Escape and returns focus to the floating button', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'))
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(controller.getSnapshot()).toBe(false)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(fab)
  })

  it('closes on an outside press but stays open for a press inside the board', () => {
    const { container } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    act(() => {
      dialog?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('recalculates placement when the panel content changes size', () => {
    let resizeCallback: (() => void) | undefined
    class MockResizeObserver {
      constructor(callback: () => void) {
        resizeCallback = callback
      }
      observe() {}
      disconnect() {
        resizeCallback = undefined
      }
    }
    const originalRO = globalThis.ResizeObserver
    const originalWidth = globalThis.innerWidth
    const originalHeight = globalThis.innerHeight
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

    try {
      globalThis.innerWidth = 1280
      globalThis.innerHeight = 800

      const { container } = mount(makeStore([]))
      const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
      if (fab === null) throw new Error('no entry')
      stubFabRect(fab, { left: 1100, top: 700, width: 129, height: 34 })

      act(() => {
        fab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const dialog = container.querySelector<HTMLElement>('[role="dialog"]')
      if (dialog === null) throw new Error('no dialog')

      let panelHeight = 200
      dialog.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 382, height: panelHeight, right: 382, bottom: panelHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

      act(() => {
        resizeCallback?.()
      })
      expect(dialog.style.top).toBe('490px')

      // Content grows to 350px (e.g. expanding card): anchor top (700) - gap (10) - panel height (350) = 340px
      panelHeight = 350
      act(() => {
        resizeCallback?.()
      })
      expect(dialog.style.top).toBe('340px')
    } finally {
      globalThis.ResizeObserver = originalRO
      globalThis.innerWidth = originalWidth
      globalThis.innerHeight = originalHeight
    }
  })
})

describe('floating entry: dragging versus clicking', () => {
  /** In-memory storage that records the writes and removes. */
  function memoryStorage(seed: Record<string, string> = {}) {
    const data = new Map(Object.entries(seed))
    const storage: CollapseStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: key => void data.delete(key),
    }
    return { storage, data }
  }

  it('treats a press that never moves as a click', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    pointer('pointerdown', 1160, 715, fab)
    // 2px is inside the slop allowance: a shaky hand must still open the board.
    pointer('pointermove', 1162, 716, fab)
    pointer('pointerup', 1162, 716, fab)
    act(() => {
      fab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(controller.getSnapshot()).toBe(true)
  })

  it('moves the entry on a drag and swallows the click that follows', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    pointer('pointerdown', 1160, 715, fab)
    pointer('pointermove', 1060, 615, fab)
    pointer('pointerup', 1060, 615, fab)
    // The browser emits a click after a drag too; without suppression this would
    // toggle the panel every time the user repositioned the entry.
    act(() => {
      fab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(controller.getSnapshot()).toBe(false)
  })

  it('dismisses the panel when a press turns into a drag, and reopens it afterwards', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    act(() => {
      fab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(controller.getSnapshot()).toBe(true)

    pointer('pointerdown', 1160, 715, fab)
    pointer('pointermove', 1000, 500, fab)
    // Crossing the threshold is where it stops being a click.
    expect(controller.getSnapshot()).toBe(false)
    pointer('pointerup', 1000, 500, fab)
    // It had been open, so it comes back at the new anchor.
    expect(controller.getSnapshot()).toBe(true)
  })

  it('keeps a closed panel closed after a move', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    pointer('pointerdown', 1160, 715, fab)
    pointer('pointermove', 1000, 500, fab)
    pointer('pointerup', 1000, 500, fab)

    // Relocating the entry must not pop the board open for someone who only wanted
    // to move it.
    expect(controller.getSnapshot()).toBe(false)
  })

  it('remembers the position and restores it on the next mount', () => {
    const { storage, data } = memoryStorage()
    const first = mount(makeStore([]), createOverlayController(), { positionStorage: storage })
    const fab = first.container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    pointer('pointerdown', 1160, 715, fab)
    pointer('pointermove', 900, 400, fab)
    pointer('pointerup', 900, 400, fab)

    expect(data.has(FAB_POSITION_STORAGE_KEY)).toBe(true)
    // The drag starts on the entry's box (1100,700) but the pointer is grabbed at
    // its centre (1160,715), so the delta is measured from the pointer, not the box:
    // dx = 900-1160 = -260 -> 840, dy = 400-715 = -315 -> 385.
    expect(JSON.parse(data.get(FAB_POSITION_STORAGE_KEY) ?? '{}')).toEqual({ left: 840, top: 385 })

    // A fresh mount (a reload) must come back to the same place.
    act(() => {
      first.container.remove()
    })
    const second = mount(makeStore([]), createOverlayController(), { positionStorage: storage })
    const restored = second.container.querySelector<HTMLButtonElement>('.status-board__fab')
    expect(restored?.style.left).toBe('840px')
    expect(restored?.style.top).toBe('385px')
    // It has been moved, so the reset control is live from the first paint.
    act(() => {
      restored?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(second.container.querySelector<HTMLButtonElement>('.status-board__overlay-reset')?.disabled).toBe(false)
  })

  it('resets by deleting the key, which returns the entry to the stylesheet corner', () => {
    const { storage, data } = memoryStorage({
      [FAB_POSITION_STORAGE_KEY]: JSON.stringify({ left: 300, top: 200 }),
    })
    const { container } = mount(makeStore([]), createOverlayController(), { positionStorage: storage })
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    act(() => {
      fab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const reset = container.querySelector<HTMLButtonElement>('.status-board__overlay-reset')
    act(() => {
      reset?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Deleting the key - not writing the default coordinates - is what makes the
    // two states distinguishable.
    expect(data.has(FAB_POSITION_STORAGE_KEY)).toBe(false)
    const after = container.querySelector<HTMLButtonElement>('.status-board__fab')
    expect(after?.style.left).toBe('')
    expect(after?.style.top).toBe('')
    expect(container.querySelector<HTMLButtonElement>('.status-board__overlay-reset')?.disabled).toBe(true)
  })

  it('marks itself as dragging so the cursor and shadow can change', () => {
    const { container } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    pointer('pointerdown', 1160, 715, fab)
    pointer('pointermove', 1000, 500, fab)
    expect(container.querySelector('.status-board__fab')?.getAttribute('data-dragging')).toBe('true')
    expect(container.querySelector('.status-board__fab')?.className).toContain('status-board__fab--dragging')

    pointer('pointerup', 1000, 500, fab)
    expect(container.querySelector('.status-board__fab')?.getAttribute('data-dragging')).toBe('false')
  })

  it('ignores a drag started with a secondary mouse button', () => {
    const { container, controller } = mount(makeStore([]))
    const fab = container.querySelector<HTMLButtonElement>('.status-board__fab')
    if (fab === null) throw new Error('no entry')
    stubFabRect(fab)

    // Right-click belongs to the context menu, not to moving the entry.
    act(() => {
      fab.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 2, buttons: 2,
          clientX: 1160, clientY: 715,
        }),
      )
    })
    pointer('pointermove', 900, 300, fab)
    pointer('pointerup', 900, 300, fab)

    expect(controller.getSnapshot()).toBe(false)
    expect(fab.style.left).toBe('')
  })

  it('renders unread arc in donut ring and updates center urgent count', () => {
    const store = makeStore([signal('r1', {}), signal('r2', {})])
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const statusMap = new Map([['r1', { completionUnread: true }]])
    act(() => {
      root.render(
        createElement(BoardOverlay, {
          controller: createOverlayController(),
          store,
          resolveNavigation: () => undefined,
          useSessionStatus: () => statusMap,
        }),
      )
    })
    mounted.push({ root, container })

    // Center text displays 1 (urgent: 0 decision + 1 unread = 1)
    expect(container.querySelector('.status-board__fab-center')?.textContent).toBe('1')

    // Tooltip shows unread count = 1
    const unreadCountEl = container.querySelectorAll('.status-board__fab-count')[1]
    expect(unreadCountEl?.textContent).toBe('1')
    expect(unreadCountEl?.getAttribute('data-empty')).toBe('false')

    // Unread segment in donut svg has opacity = 1
    const unreadSeg = container.querySelector('.status-board__fab-seg--unread')
    expect(unreadSeg?.getAttribute('style')).toContain('opacity: 1')
  })
})
