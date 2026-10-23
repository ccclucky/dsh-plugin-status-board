/**
 * The floating board (shape C).
 *
 * These cover the behaviours a user can actually hit — toggling, Escape, an
 * outside press, and focus movement — because a popover that opens but cannot be
 * dismissed is worse than no popover.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BoardNavEntry, BoardOverlay, createOverlayController } from '../src/client/overlay.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import type { BoardState, BoardStore } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeStore(signals: readonly SessionSignal[]): BoardStore {
  const state: BoardState = {
    status: 'ready',
    board: buildBoard(signals, { ...CONFIG_DEFAULTS, recentWindowHours: 24, maxRecent: 20 }, NOW),
    config: CONFIG_DEFAULTS,
    collapse: {},
    locale: 'en',
  } as unknown as BoardState
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    toggle: () => {},
    setLocale: () => {},
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

function mount(element: ReturnType<typeof createElement>): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  mounted.push({ root, container })
  return container
}

/**
 * Render the overlay with a nav-row stand-in, as the two slot registrations do
 * in the real shell: `BoardNavEntry` draws the row and opens the board, and
 * `BoardOverlay` renders the panel.
 */
function mountPair(store: BoardStore, controller = createOverlayController()) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (): void => {
    act(() =>
      root.render(
        createElement(
          'div',
          null,
          createElement(
            'button',
            { type: 'button', 'data-status-board-entry': 'true' },
            createElement(BoardNavEntry, { controller, store, size: 16 }),
          ),
          createElement(BoardOverlay, { controller, store, resolveNavigation: () => undefined }),
        ),
      ),
    )
  }
  render()
  mounted.push({ root, container })
  return { container, controller, rerender: render }
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
    const seen = vi.fn()
    controller.subscribe(seen)
    controller.close() // already closed
    expect(seen).not.toHaveBeenCalled()
    controller.toggle()
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const controller = createOverlayController()
    const seen = vi.fn()
    const off = controller.subscribe(seen)
    off()
    controller.toggle()
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('BoardOverlay', () => {
  it('renders the nav-row readout badge even while closed', () => {
    // The badge is the entry's whole point: the framework row can only carry
    // icon + plain text, so the coloured counts live in the overlay layer and
    // must be present without the panel being open.
    const store = makeStore([])
    const row = document.createElement('button')
    row.dataset.statusBoardEntry = 'true'
    document.body.append(row)
    const container = mount(
      createElement(BoardOverlay, { controller: createOverlayController(), store, resolveNavigation: () => undefined }),
    )
    expect(container.querySelector('.status-board__row-badge')).not.toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelectorAll('.status-board__metric')).toHaveLength(3)
    row.remove()
  })

  it('renders no badge when there is no nav row to attach it to', () => {
    // The collapsed rail draws no nav rows, and the badge must not float free.
    const store = makeStore([])
    const container = mount(
      createElement(BoardOverlay, { controller: createOverlayController(), store, resolveNavigation: () => undefined }),
    )
    expect(container.querySelector('.status-board__row-badge')).toBeNull()
  })
  it('renders nothing until opened', () => {
    const store = makeStore([])
    const container = mount(
      createElement(BoardOverlay, { controller: createOverlayController(), store, resolveNavigation: () => undefined }),
    )
    expect(container.innerHTML).toBe('')
  })

  it('opens from the trigger as a labelled dialog and closes again', () => {
    const store = makeStore([])
    const { container } = mountPair(store)

    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-label')).toBe('Session Status Board')

    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on Escape', () => {
    const store = makeStore([])
    const { container } = mountPair(store)
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on a click outside the board', () => {
    const store = makeStore([])
    const { container } = mountPair(store)
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('stays open when the press lands inside the board', () => {
    const store = makeStore([])
    const { container } = mountPair(store)
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    act(() => {
      dialog?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('takes focus on open so the keyboard user is not stranded', () => {
    const store = makeStore([])
    const { container } = mountPair(store)
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'))
  })
})
