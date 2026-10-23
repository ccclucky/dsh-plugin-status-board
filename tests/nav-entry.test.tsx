/**
 * The sidebar-nav entry (shape A).
 *
 * The risky part of this shape is not the visuals: it is that the nav row's
 * button belongs to the framework and normally navigates. These tests pin the
 * interception, because a row that selects a dead main column would be worse
 * than no row at all.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BoardNavEntry, describeCountsShort, createOverlayController } from '../src/client/overlay.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import type { BoardState, BoardStore } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 9, 23, 11, 30, 0)

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

/**
 * Mount the entry the way the shell does: inside a nav-row button that has its
 * own click handler (the framework's navigation).
 *
 * `rerender` allows dropping just the entry while the row stays mounted, which
 * is the only way to tell whether the plugin removed its capture listener rather
 * than the whole tree disappearing underneath it.
 */
function mountInRow(store: BoardStore, controller = createOverlayController()) {
  const container = document.createElement('div')
  document.body.append(container)
  const navigate = vi.fn()
  const root = createRoot(container)

  const draw = (withEntry: boolean): void => {
    act(() => {
      root.render(
        createElement(
          'button',
          { type: 'button', onClick: navigate },
          withEntry ? createElement(BoardNavEntry, { controller, store, size: 16 }) : null,
          createElement('span', null, 'Session Status Board'),
        ),
      )
    })
  }

  draw(true)
  mounted.push({ root, container })
  const row = container.querySelector('button') as HTMLButtonElement
  return {
    container,
    row,
    navigate,
    controller,
    /** Drop the entry, keeping the row itself in place. */
    dropEntry: () => draw(false),
  }
}

describe('BoardNavEntry', () => {
  it('renders the glyph only, leaving the row chrome to the framework', () => {
    const { container } = mountInRow(makeStore([]))
    expect(container.querySelector('.status-board__nav-glyph')).not.toBeNull()
    // No button of its own: a nested button is invalid HTML and would swallow
    // the row's own semantics.
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('opens the board instead of navigating when the row is clicked', () => {
    const store = makeStore([signal('a', { awaitingDecision: true })])
    const { row, navigate, controller } = mountInRow(store)
    expect(controller.getSnapshot()).toBe(false)

    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The whole point of this shape: the row must not navigate away.
    expect(navigate).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toBe(true)
  })

  it('toggles back closed on a second click', () => {
    const { row, controller } = mountInRow(makeStore([]))
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(controller.getSnapshot()).toBe(false)
  })

  it('states the counts on the row for assistive technology', () => {
    const store = makeStore([
      signal('d', { awaitingDecision: true }),
      signal('e', { running: true }),
      signal('r', {}),
    ])
    const { row } = mountInRow(store)
    // The row is icon + text only, so the numbers are part of its description.
    expect(row.getAttribute('aria-label')).toContain('Needs my decision 1')
    expect(row.getAttribute('aria-label')).toContain('Running 1')
    expect(row.getAttribute('aria-controls')).toBeTruthy()
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('marks the row so the panel does not treat it as an outside click', () => {
    const { row } = mountInRow(makeStore([]))
    expect(row.dataset.statusBoardEntry).toBe('true')
  })

  it('stops intercepting once the entry is gone', () => {
    const { row, navigate, dropEntry } = mountInRow(makeStore([]))
    dropEntry()
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // The framework's own handler works again: the plugin must not leave a
    // permanent capture listener on someone else's button.
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})

describe('describeCountsShort', () => {
  it('reports the three counts in board order', () => {
    const store = makeStore([
      signal('d', { awaitingDecision: true }),
      signal('e1', { running: true }),
      signal('e2', { running: true }),
      signal('r', {}),
    ])
    expect(describeCountsShort(undefined as never, store.getSnapshot())).toBe('1 · 2 · 1')
  })

  it('reports zeros rather than omitting a board', () => {
    const store = makeStore([])
    expect(describeCountsShort(undefined as never, store.getSnapshot())).toBe('0 · 0 · 0')
  })
})