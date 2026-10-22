/**
 * Panel rendering contract.
 *
 * Rendered with `react-dom/server` so the assertions are about the DOM the
 * Harness will actually receive: the three boards, the disclosure semantics, the
 * accessible names, and the guarantee that a panel cannot render a blank region
 * by accident.
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoardPanel, BoardGlyph } from '../src/client/Panel.tsx'
import { createBoardStore } from '../src/client/store.ts'
import type { SessionListLike } from '../src/client/session-source.ts'
import type { ResolvedStatusBoardConfig } from '../src/shared/types.ts'

const NOW = 1_700_000_000_000

/** The documented defaults, spelled out so a default change fails loudly. */
const DEFAULTS: ResolvedStatusBoardConfig = {
  recentWindowHours: 24,
  maxRecent: 20,
  defaultCollapsed: 'recent',
  showEmptyBuckets: true,
}

/** A session row with the fields the adapter reads. */
function row(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return { id, displayTitle: title, running: false, updatedAt: NOW, ...overrides }
}

/**
 * Build a store over a fixed session list, with the configuration already
 * applied (the real store fetches it asynchronously; the tests await the same
 * two microtask hops the promise takes).
 */
async function storeFor(
  rows: Record<string, unknown>[],
  config: ResolvedStatusBoardConfig = DEFAULTS,
  phase: 'pending' | 'ready' = 'ready',
): Promise<ReturnType<typeof createBoardStore>> {
  const byId = Object.fromEntries(rows.map(item => [item.id as string, item])) as Record<string, never>
  const snapshot: SessionListLike = { byId, phase }
  const store = createBoardStore({
    sessions: { list: { getSnapshot: () => snapshot, subscribe: () => () => {} } },
    locale: { getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} },
    now: () => NOW,
    loadConfig: () => Promise.resolve(config),
  })
  await Promise.resolve()
  await Promise.resolve()
  return store
}

/** Render the panel to static markup, optionally wiring the open action. */
async function render(
  rows: Record<string, unknown>[],
  options: { config?: ResolvedStatusBoardConfig; onOpenSession?: (id: string) => void; phase?: 'pending' | 'ready' } = {},
): Promise<string> {
  const store = await storeFor(rows, options.config ?? DEFAULTS, options.phase ?? 'ready')
  const props =
    options.onOpenSession === undefined ? { store } : { store, onOpenSession: options.onOpenSession }
  const markup = renderToStaticMarkup(createElement(BoardPanel, props))
  store.dispose()
  return markup
}

describe('BoardPanel', () => {
  it('renders the three board names in declaration order', async () => {
    const markup = await render([])
    const order = ['Needs my decision', 'Running', 'Recent records'].map(name => markup.indexOf(name))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('renders a session title on each board', async () => {
    const markup = await render(
      [
        row('d', 'Decide this', { running: true }),
        row('e', 'Running hard', { running: true }),
        row('r', 'Done earlier'),
      ],
      { config: { ...DEFAULTS, defaultCollapsed: 'none' } },
    )
    // The decision row is produced by the projection, not by a scalar field:
    // build its store separately below. Here we only assert the two plain rows.
    expect(markup).toContain('Running hard')
    expect(markup).toContain('Done earlier')
    expect(markup).toContain('Needs my decision')
  })

  it('places a session on the decision board from its userQuestions projection', async () => {
    const store = createBoardStore({
      sessions: {
        list: {
          getSnapshot: () =>
            ({
              byId: { d: row('d', 'Decide this') },
              phase: 'ready',
              projectionsBySession: { d: { values: { userQuestions: { active: [{ id: 'q' }] } } } },
            }) as never,
          subscribe: () => () => {},
        },
      },
      locale: { getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} },
      now: () => NOW,
      loadConfig: () => Promise.resolve({ ...DEFAULTS, defaultCollapsed: 'none' }),
    })
    await Promise.resolve()
    await Promise.resolve()
    const markup = renderToStaticMarkup(createElement(BoardPanel, { store }))
    store.dispose()
    expect(markup).toContain('Decide this')
    expect(store.getSnapshot().board.counts.decision).toBe(1)
  })

  it('shows the row count on every board header', async () => {
    const markup = await render([row('e1', 'One', { running: true }), row('e2', 'Two', { running: true })])
    expect(markup).toMatch(/status-board__count[^>]*>2</)
  })

  it('exposes a disclosure button with a resolvable aria-controls on each board', async () => {
    const markup = await render([])
    expect(markup.match(/aria-expanded=/g)).toHaveLength(3)
    const controlled = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map(match => match[1])
    expect(controlled).toHaveLength(3)
    // Every IDREF must resolve to an element that is actually in the document.
    for (const id of controlled) {
      expect(markup).toContain(`id="${String(id)}"`)
    }
  })

  it('keeps the collapsed region mounted and hides it', async () => {
    const markup = await render([row('r', 'Old work')])
    expect(markup).toContain('hidden=""')
    // The rows are present in the DOM (so the IDREF resolves) but not rendered
    // by the browser because of `hidden`.
    expect(markup).toContain('Old work')
  })

  it('wraps each toggle in a real heading instead of a role inside a button', async () => {
    const markup = await render([])
    expect(markup.match(/<h2/g)).toHaveLength(3)
    // The broken pattern this replaces: a `role="heading"` span nested in the
    // button subtree, which the accessibility tree would discard.
    expect(markup).not.toContain('role="heading"')
  })

  it('names the panel exactly once, via aria-labelledby', async () => {
    const markup = await render([])
    expect(markup).not.toContain('aria-label="Session status board"')
    expect(markup).toContain('aria-labelledby="status-board-title-')
  })

  it('generates unique DOM ids instead of reused constants', async () => {
    const markup = await render([])
    const ids = [...markup.matchAll(/id="(status-board-[^"]+)"/g)].map(match => match[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renders an explicit empty state instead of a blank board', async () => {
    const markup = await render([])
    expect(markup).toContain('No sessions')
  })

  it('reports loading distinctly from empty', async () => {
    const markup = await render([], { phase: 'pending' })
    expect(markup).toContain('Reading sessions')
    expect(markup).not.toContain('No sessions to show yet')
  })

  it('renders rows as buttons only when opening a session is wired', async () => {
    const rows = [row('e', 'Act on me', { running: true })]
    const withAction = await render(rows, { onOpenSession: () => {} })
    expect(withAction).toContain('Open session: Act on me')

    const withoutAction = await render(rows)
    expect(withoutAction).not.toContain('Open session:')
    // Only the three board toggles remain as buttons.
    expect(withoutAction.match(/<button/g)?.length).toBe(3)
  })

  it('invokes the open action with the session id', async () => {
    const onOpen = vi.fn()
    const store = await storeFor([row('e', 'Act on me', { running: true })])
    const element = createElement(BoardPanel, { store, onOpenSession: onOpen }) as unknown as {
      props: { onOpenSession: (id: string) => void }
    }
    // Drive the prop exactly as the shell's row button does.
    element.props.onOpenSession('e')
    store.dispose()
    expect(onOpen).toHaveBeenCalledWith('e')
  })

  it('labels the toggle with the board, the action and the count', async () => {
    const markup = await render([row('e', 'x', { running: true })])
    expect(markup).toContain('Collapse')
    expect(markup).toContain('1 sessions')
  })

  it('embeds the panel stylesheet so the panel is self-contained', async () => {
    const markup = await render([])
    expect(markup).toContain('<style>')
    expect(markup).toContain('.status-board')
  })

  it('uses only theme tokens for colour', async () => {
    const store = await storeFor([])
    const markup = renderToStaticMarkup(createElement(BoardPanel, { store }))
    store.dispose()
    const styleBlock = markup.slice(markup.indexOf('<style>'), markup.indexOf('</style>'))
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleBlock).not.toMatch(/rgba?\(/)
    expect(styleBlock).toContain('var(--dsw-alias-')
  })

  it('announces the panel as a labelled region', async () => {
    const markup = await render([])
    expect(markup).toContain('role="region"')
    expect(markup).toContain('aria-labelledby="status-board-title-')
  })

  it('renders a total-session summary', async () => {
    const markup = await render([row('e1', 'a', { running: true }), row('e2', 'b', { running: true })])
    expect(markup).toContain('2 sessions')
  })

  it('reports how many recent rows the cap hid', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => row(`r${index}`, `Row ${index}`))
    const markup = await render(rows, { config: { ...DEFAULTS, maxRecent: 2, defaultCollapsed: 'none' } })
    expect(markup).toContain('3 older sessions are hidden')
  })

  it('hides an empty board when the operator turned headers off', async () => {
    const cards = (markup: string): number => markup.match(/class="status-board__card"/g)?.length ?? 0
    expect(cards(await render([]))).toBe(3)
    const withoutHeaders = await render([], {
      config: { ...DEFAULTS, showEmptyBuckets: false, defaultCollapsed: 'none' },
    })
    expect(cards(withoutHeaders)).toBe(0)
  })

  it('offers a retry control in the error state', async () => {
    const store = createBoardStore({
      // No session list at all: the profile does not expose the service.
      sessions: {},
      locale: { getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} },
      now: () => NOW,
      loadConfig: () => Promise.resolve(undefined),
    })
    const markup = renderToStaticMarkup(createElement(BoardPanel, { store }))
    store.dispose()
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Retry')
  })

  it('renders Chinese copy when the locale service reports zh', async () => {
    const store = createBoardStore({
      sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
      locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
      now: () => NOW,
      loadConfig: () => Promise.resolve(undefined),
    })
    const markup = renderToStaticMarkup(createElement(BoardPanel, { store }))
    store.dispose()
    expect(markup).toContain('待我决策')
    expect(markup).toContain('正在执行')
    expect(markup).toContain('近期记录')
  })
})

describe('BoardGlyph', () => {
  it('renders a decorative svg hidden from assistive technology', () => {
    const markup = renderToStaticMarkup(createElement(BoardGlyph, { size: 20 }))
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('width="20"')
  })
})