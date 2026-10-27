/**
 * Entry ①: the sidebar row expands a real, inline navigation tree.
 *
 * The risky part is not the visuals: the row's button belongs to the framework
 * and normally navigates. These tests pin three things — the row toggles the
 * tree instead of navigating, the tree is portaled into the sidebar's nav and
 * removed on unmount, and a session row keeps the Workspace browser's contract
 * (click = open session, no answer controls in the tree).
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BoardNavEntry, createOverlayController, describeCounts } from '../src/client/overlay.tsx'
import { buildBoard } from '../src/shared/board.ts'
import { CONFIG_DEFAULTS } from '../src/shared/config.ts'
import { createTranslate } from '../src/shared/i18n.ts'
import type { BoardState, BoardStore } from '../src/client/store.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const NOW = Date.UTC(2026, 9, 23, 11, 30, 0)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** One classifier input, with the fields the tree cares about. */
function signal(id: string, extra: Partial<SessionSignal> = {}): SessionSignal {
  return { id, title: id, running: false, awaitingDecision: false, lastActivityAt: NOW - 60_000, ...extra }
}

/** A store double over a fixed board; folder clicks only need a callable toggle. */
function makeStore(signals: readonly SessionSignal[]): BoardStore & { toggled: string[] } {
  const toggled: string[] = []
  const collapse = { decision: false, executing: false, recent: true }
  const state = {
    status: 'ready',
    board: buildBoard(signals, { ...CONFIG_DEFAULTS, recentWindowHours: 24, maxRecent: 20 }, NOW),
    config: CONFIG_DEFAULTS,
    collapse,
    locale: 'en',
  } as unknown as BoardState
  return {
    toggled,
    subscribe: () => () => {},
    getSnapshot: () => state,
    toggle: (id: string) => {
      toggled.push(id)
    },
    dispose: () => {},
  } as unknown as BoardStore & { toggled: string[] }
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []
afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount())
    entry.container.remove()
  }
  document.querySelectorAll('[data-status-board-tree]').forEach(node => node.remove())
})

/**
 * Mount the entry the way the shell does: inside a nav, inside the row button
 * that owns the framework navigation handler.
 */
function mountInNav(store: BoardStore, options: { size?: number; onOpen?: (id: string) => void; withNav?: boolean } = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const navigate = vi.fn()
  const tree = createOverlayController()
  const rowButton = document.createElement('button')
  rowButton.type = 'button'
  rowButton.addEventListener('click', navigate)
  const nav = document.createElement('nav')
  nav.setAttribute('aria-label', 'panels')
  nav.append(rowButton)
  if (options.withNav === false) container.append(rowButton)
  else container.append(nav)

  const entryRoot = createRoot(rowButton)
  act(() => {
    entryRoot.render(
      createElement(BoardNavEntry, {
        tree,
        store,
        size: options.size ?? 16,
        resolveNavigation: () => options.onOpen,
      }),
    )
  })
  mounted.push({ root: entryRoot, container })
  return { container, row: rowButton, nav, tree, navigate, store, root: entryRoot }
}

describe('BoardNavEntry (entry ①)', () => {
  it('renders the glyph and a chevron inside the framework row', () => {
    const { row } = mountInNav(makeStore([]))
    expect(row.querySelector('.status-board__nav-glyph')).not.toBeNull()
    expect(row.querySelector('.status-board__nav-chevron')).not.toBeNull()
    // No nested button: the row owns the semantics.
    expect(row.querySelectorAll('button')).toHaveLength(0)
  })

  it('toggles the tree instead of navigating when the row is clicked', () => {
    const store = makeStore([signal('d', { awaitingDecision: true })])
    const { row, navigate, tree } = mountInNav(store)
    expect(tree.getSnapshot()).toBe(false)
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(navigate).not.toHaveBeenCalled()
    expect(tree.getSnapshot()).toBe(true)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(tree.getSnapshot()).toBe(false)
  })

  it('portals a three-folder tree into the sidebar nav after the row', () => {
    const store = makeStore([
      signal('d', { awaitingDecision: true }),
      signal('e', { running: true }),
      signal('r', {}),
    ])
    const { row, nav, tree } = mountInNav(store, { onOpen: () => {} })
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const portal = nav.querySelector<HTMLElement>('[data-status-board-tree]')
    expect(portal).not.toBeNull()
    expect(portal?.hidden).toBe(false)
    expect(portal?.querySelectorAll('.status-board-tree__toggle')).toHaveLength(4)
    // The tree is navigation only: no answer/approval controls.
    expect(portal?.querySelector('.status-board__answer-toggle')).toBeNull()
    expect(portal?.textContent).toContain('Needs my decision')
    expect(tree.getSnapshot()).toBe(true)
  })

  it('opens a session from a row and keeps the tree open', () => {
    const onOpen = vi.fn()
    const { row, nav } = mountInNav(makeStore([signal('r', { title: 'Recent work' })]), { onOpen })
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const sessionButton = nav.querySelector<HTMLButtonElement>('.status-board-tree__row')
    expect(sessionButton).not.toBeNull()
    expect(sessionButton?.getAttribute('aria-label')).toContain('Recent work')
    act(() => {
      sessionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpen).toHaveBeenCalledWith('r')
  })

  it('keeps the tree out of the 56px rail', () => {
    const { row, tree, navigate } = mountInNav(makeStore([]), { size: 18 })
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // The row still must not navigate into a dead main column; it simply has no
    // tree to show in the rail.
    expect(navigate).not.toHaveBeenCalled()
    expect(tree.getSnapshot()).toBe(false)
    expect(document.querySelector('[data-status-board-tree]')).toBeNull()
    expect(row.querySelector('.status-board__nav-chevron')).toBeNull()
  })

  it('removes the portal and the capture listener on unmount', () => {
    const store = makeStore([])
    const { row, navigate, root, container } = mountInNav(store)
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.querySelector('[data-status-board-tree]')).not.toBeNull()
    act(() => root.unmount())
    expect(document.querySelector('[data-status-board-tree]')).toBeNull()
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // The framework's own handler works again.
    expect(navigate).toHaveBeenCalledTimes(1)
    container.remove()
  })

  it('falls back to an anchored panel when the shell exposes no nav', () => {
    const store = makeStore([])
    const { row, tree } = mountInNav(store, { withNav: false })
    // A laid-out row is required for the fallback's fixed rect.
    row.getBoundingClientRect = () =>
      ({ left: 10, right: 210, top: 100, bottom: 132, width: 200, height: 32, x: 10, y: 100, toJSON: () => ({}) }) as DOMRect
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(tree.getSnapshot()).toBe(true)
    // The fallback is portaled to body, so it is not nested inside the row button.
    expect(document.querySelector('.status-board__tree-fallback')).not.toBeNull()
  })
})

describe('describeCounts', () => {
  it('marks a finished, unopened session and reports it in the folder header', () => {
    const store = makeStore([signal('r', {})])
    const container = document.createElement('div')
    document.body.append(container)
    const nav = document.createElement('nav')
    nav.setAttribute('aria-label', 'panels')
    const rowButton = document.createElement('button')
    rowButton.type = 'button'
    nav.append(rowButton)
    container.append(nav)

    const root = createRoot(rowButton)
    const statusMap = new Map([['r', { completionUnread: true }]])
    act(() => {
      root.render(
        createElement(BoardNavEntry, {
          tree: createOverlayController(),
          store,
          size: 16,
          resolveNavigation: () => undefined,
          // The shell injects this as a slot-standard prop, not through ctx.
          useSessionStatus: () => statusMap,
        }),
      )
    })
    mounted.push({ root, container })

    // Open the tree so the rows exist in the portal.
    act(() => {
      rowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The dot lives on the shared marker (one mark per row, not a second element).
    expect(container.querySelector('.status-board-status[data-unopened="true"]')).not.toBeNull()
    // The unopened folder is promoted as its own folder in the tree.
    expect(container.querySelector('.status-board-tree__folder[data-bucket="unread"]')).not.toBeNull()
    expect(container.querySelector('.status-board-tree__folder[data-bucket="unread"] .status-board-tree__count')?.textContent).toContain('1')
  })

  it('renders the tree without the hook, so a bare shell still works', () => {
    const store = makeStore([signal('r', {})])
    const { container, row } = mountInNav(store)
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.status-board-tree__folder')).not.toBeNull()
    expect(container.querySelector('.status-board-status[data-unopened="true"]')).toBeNull()
  })

  it('reports the three counts in board order', () => {
    const translate = createTranslate('en')
    expect(describeCounts(translate, { decision: 1, executing: 2, recent: 3 })).toContain('Needs my decision 1')
    expect(describeCounts(translate, { decision: 1, executing: 2, recent: 3 })).toContain('Running 2')
    expect(describeCounts(translate, { decision: 1, executing: 2, recent: 3 })).toContain('Recent records 3')
  })
})
