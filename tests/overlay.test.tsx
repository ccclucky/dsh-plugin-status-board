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
import type { BoardState, BoardStore } from '../src/client/store.ts'
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

function mount(store: BoardStore, controller = createOverlayController()) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(BoardOverlay, {
        controller,
        store,
        resolveNavigation: () => undefined,
      }),
    )
  })
  mounted.push({ root, container })
  return { container, controller }
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

  it('shows the decision count on the floating button', () => {
    const { container } = mount(makeStore([signal('d', { awaitingDecision: true })]))
    expect(container.querySelector('.status-board__fab-badge')?.textContent).toBe('1')
    expect(container.querySelector('.status-board__fab')?.getAttribute('aria-label')).toContain('Needs my decision 1')
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
})
