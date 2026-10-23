/**
 * Tests for the sidebar surfaces.
 *
 * The sidebar decoration is the plugin's primary face, so these lock the two
 * facts a user can actually see: which board a row belongs to, and that a row
 * the board does not list renders nothing rather than an empty cell.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SessionRowDetail, SessionRowMark, bucketOf } from '../src/client/Sidebar.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import type { BoardState } from '../src/client/store.ts'
import type { BoardStore } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0)

// React 18 warns on every `act` call unless it is told this is a test build.
// The panel suite sets the same flag for the same reason.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function signal(id: string, extra: Partial<SessionSignal> = {}): SessionSignal {
  // Both required fields are stated so the fixture matches production exactly.
  return { id, title: id, running: false, awaitingDecision: false, lastActivityAt: NOW - 60_000, ...extra }
}

/** A store stub: the sidebar components only subscribe and read a snapshot. */
function stubStore(state: BoardState): BoardStore {
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    toggle: () => {},
    setLocale: () => {},
    dispose: () => {},
  } as unknown as BoardStore
}

function stateWith(signals: readonly SessionSignal[]): BoardState {
  return {
    status: 'ready',
    board: buildBoard(signals, { ...CONFIG_DEFAULTS, recentWindowHours: 24, maxRecent: 20 }, NOW),
    config: CONFIG_DEFAULTS,
    collapse: {},
    locale: 'en',
  } as unknown as BoardState
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount())
    entry.container.remove()
  }
})

function render(element: ReturnType<typeof createElement>): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  mounted.push({ root, container })
  return container
}

describe('bucketOf', () => {
  it('finds the board that lists a session', () => {
    const state = stateWith([signal('a', { running: true }), signal('b', { awaitingDecision: true })])
    expect(bucketOf(state, 'a')).toBe('executing')
    expect(bucketOf(state, 'b')).toBe('decision')
  })

  it('returns undefined for a session the board does not list', () => {
    // Idle session outside the recent window: the boards deliberately omit it,
    // and the row must then render nothing rather than claim a state.
    const state = stateWith([signal('old', { lastActivityAt: NOW - 30 * 24 * 3600_000 })])
    expect(bucketOf(state, 'old')).toBeUndefined()
  })
})

describe('SessionRowMark', () => {
  it('renders a dot carrying the board name in its title', () => {
    const state = stateWith([signal('a', { awaitingDecision: true })])
    const container = render(createElement(SessionRowMark, { sessionId: 'a', store: stubStore(state) }))
    const mark = container.querySelector('.status-board__mark')
    expect(mark).not.toBeNull()
    expect(mark?.getAttribute('title')).toBe('Needs my decision')
  })

  it('renders nothing for a session outside every board', () => {
    const state = stateWith([signal('old', { lastActivityAt: NOW - 30 * 24 * 3600_000 })])
    const container = render(createElement(SessionRowMark, { sessionId: 'old', store: stubStore(state) }))
    expect(container.innerHTML).toBe('')
  })

  it('hides the dot from assistive technology', () => {
    // The row's own accessible name already describes it; an extra decorative
    // dot announced on every row would only add noise.
    const state = stateWith([signal('a', { running: true })])
    const container = render(createElement(SessionRowMark, { sessionId: 'a', store: stubStore(state) }))
    expect(container.querySelector('.status-board__mark')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('SessionRowDetail', () => {
  it('spells the board out in words', () => {
    const state = stateWith([signal('a', { running: true })])
    const container = render(createElement(SessionRowDetail, { sessionId: 'a', store: stubStore(state) }))
    expect(container.textContent).toContain('Board:')
    expect(container.textContent).toContain('Running')
  })

  it('renders nothing for an unlisted session', () => {
    const state = stateWith([])
    const container = render(createElement(SessionRowDetail, { sessionId: 'missing', store: stubStore(state) }))
    expect(container.innerHTML).toBe('')
  })
})