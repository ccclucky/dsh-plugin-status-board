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
import { BoardOverlay, BoardTrigger, createOverlayController } from '../src/client/overlay.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import type { BoardState, BoardStore } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function signal(id: string, extra: Partial<SessionSignal> = {}): SessionSignal {
  return { id, title: id, running: false, awaitingDecision: false, lastActivityAt: NOW - 60_000, ...extra }
}

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

/** Render trigger and overlay together, as the two slot registrations do. */
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
          createElement(BoardTrigger, { controller, store, wide: true }),
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

describe('BoardTrigger', () => {
  it('reports its expanded state and points at the panel it controls', () => {
    const store = makeStore([])
    const controller = createOverlayController()
    const container = mount(createElement(BoardTrigger, { controller, store, wide: true }))
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    // The ARIA IDREF must resolve once the panel opens; a dangling one is the
    // classic disclosure bug.
    expect(button?.getAttribute('aria-controls')).toBeTruthy()
  })

  it('reads out all three counts in the wide sidebar', () => {
    const store = makeStore([
      signal('a', { awaitingDecision: true }),
      signal('b', { running: true }),
      signal('c', { running: true }),
      signal('d', {}),
    ])
    const controller = createOverlayController()
    const container = mount(createElement(BoardTrigger, { controller, store, wide: true }))
    // Option A: the entry is a readout, so every non-empty board contributes a
    // metric — the point is knowing the state without opening the panel.
    expect(container.querySelectorAll('.status-board__metric')).toHaveLength(3)
    expect(container.querySelector('[data-metric="decision"]')?.textContent).toBe('1')
    expect(container.querySelector('[data-metric="executing"]')?.textContent).toBe('2')
    // The counts are stated once, in the trigger's accessible name.
    expect(container.querySelector('button')?.getAttribute('aria-label')).toContain('Needs my decision 1')
  })

  it('collapses to the glyph plus the decision count in the 56px rail', () => {
    // The rail has no room for a strip; overflowing it would break the column.
    // The decision count is the one number worth keeping.
    const store = makeStore([signal('a', { awaitingDecision: true }), signal('b', { running: true })])
    const controller = createOverlayController()
    const container = mount(createElement(BoardTrigger, { controller, store, wide: false }))
    expect(container.querySelector('.status-board__strip')).toBeNull()
    expect(container.querySelector('.status-board__trigger-count')?.textContent).toBe('1')
  })
})

describe('BoardOverlay', () => {
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