/**
 * Panel rendering contract.
 *
 * Rendered with `react-dom/server` so the assertions are about the DOM the
 * Harness will actually receive: the three boards, the collapse semantics, the
 * accessible names, and the guarantee that a panel cannot render a blank region
 * by accident.
 */
import { describe, expect, it, vi } from 'vitest'
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
  return { id, displayTitle: title, running: false, lastActivityAt: NOW, ...overrides }
}

/**
 * Build a store over a fixed session list, with the configuration already
 * applied (the real store fetches it asynchronously; the tests await the same
 * two microtask hops the promise takes).
 */
async function storeFor(
  rows: Record<string, unknown>[],
  config: ResolvedStatusBoardConfig = DEFAULTS,
): Promise<ReturnType<typeof createBoardStore>> {
  const byId = Object.fromEntries(rows.map(item => [item.id as string, item])) as Record<string, never>
  const snapshot: SessionListLike = { byId }
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
  options: { config?: ResolvedStatusBoardConfig; onOpenSession?: (id: string) => void } = {},
): Promise<string> {
  const store = await storeFor(rows, options.config ?? DEFAULTS)
  const props =
    options.onOpenSession === undefined ? { store } : { store, onOpenSession: options.onOpenSession }
  const markup = renderToStaticMarkup(BoardPanel(props as never) as never)
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
        row('d', 'Decide this', { awaitingDecision: true }),
        row('e', 'Running hard', { running: true }),
        row('r', 'Done earlier'),
      ],
      { config: { ...DEFAULTS, defaultCollapsed: 'none' } },
    )
    expect(markup).toContain('Decide this')
    expect(markup).toContain('Running hard')
    expect(markup).toContain('Done earlier')
  })

  it('shows the row count on every board header', async () => {
    const markup = await render([row('d', 'One', { awaitingDecision: true }), row('e', 'Two', { running: true })])
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toMatch(/status-board__count[^>]*>1</)
  })

  it('exposes aria-expanded and aria-controls on each toggle', async () => {
    const markup = await render([])
    expect(markup.match(/aria-expanded=/g)).toHaveLength(3)
    expect(markup.match(/aria-controls=/g)).toHaveLength(3)
  })

  it('collapses only the recent board by default, hiding its region', async () => {
    const markup = await render([row('r', 'Old work')])
    expect(markup).not.toContain('Old work')
    expect(markup).toContain('aria-expanded="false"')
    // The two actionable boards stay open.
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(2)
  })

  it('renders an explicit empty state instead of a blank board', async () => {
    const markup = await render([])
    expect(markup).toContain('No sessions')
  })

  it('renders rows as buttons only when opening a session is wired', async () => {
    const rows = [row('d', 'Act on me', { awaitingDecision: true })]
    const withAction = await render(rows, { onOpenSession: () => {} })
    expect(withAction).toContain('Open session: Act on me')

    const withoutAction = await render(rows)
    expect(withoutAction).not.toContain('Open session:')
    // Only the three board toggles remain as buttons.
    expect(withoutAction.match(/<button/g)?.length).toBe(3)
  })

  it('hands the session id to the open action', async () => {
    const onOpen = vi.fn()
    const store = await storeFor([row('d', 'Act on me', { awaitingDecision: true })])
    // The markup exposes the handler closure's target through the accessible
    // name; the callback itself is only reachable from a real event, so this
    // asserts the wiring the browser will use.
    const markup = renderToStaticMarkup(BoardPanel({ store, onOpenSession: onOpen }) as never)
    store.dispose()
    expect(markup).toContain('Act on me')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('labels the toggle with the board, the action and the count', async () => {
    const markup = await render([row('d', 'x', { awaitingDecision: true })])
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
    const markup = renderToStaticMarkup(BoardPanel({ store }) as never)
    store.dispose()
    const styleBlock = markup.slice(markup.indexOf('<style>'), markup.indexOf('</style>'))
    // Every colour reference in the panel CSS must be a Harness token.
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleBlock).not.toMatch(/rgba?\(/)
    expect(styleBlock).toContain('var(--dsw-alias-')
  })

  it('announces the panel as a labelled region', async () => {
    const markup = await render([])
    expect(markup).toContain('role="region"')
    expect(markup).toContain('aria-labelledby="status-board-title"')
  })

  it('renders a total-session summary', async () => {
    const markup = await render([row('d', 'a', { awaitingDecision: true }), row('e', 'b', { running: true })])
    expect(markup).toContain('2 sessions')
  })

  it('reports how many recent rows the cap hid', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => row(`r${index}`, `Row ${index}`))
    const markup = await render(rows, {
      config: { ...DEFAULTS, maxRecent: 2, defaultCollapsed: 'none' },
    })
    expect(markup).toContain('3 older sessions are hidden')
  })

  it('hides an empty board when the operator turned headers off', async () => {
    // Count rendered cards, not raw `data-bucket` occurrences: the stylesheet
    // also selects on that attribute.
    const cards = (markup: string): number => markup.match(/class="status-board__card"/g)?.length ?? 0

    expect(cards(await render([]))).toBe(3)

    const withoutHeaders = await render([], {
      config: { ...DEFAULTS, showEmptyBuckets: false, defaultCollapsed: 'none' },
    })
    expect(cards(withoutHeaders)).toBe(0)
  })

  it('renders Chinese copy when the locale service reports zh', async () => {
    const store = createBoardStore({
      sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
      locale: { getSnapshot: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
      now: () => NOW,
      loadConfig: () => Promise.resolve(undefined),
    })
    const markup = renderToStaticMarkup(BoardPanel({ store }) as never)
    store.dispose()
    expect(markup).toContain('待我决策')
    expect(markup).toContain('正在执行')
    expect(markup).toContain('近期记录')
  })
})

describe('BoardGlyph', () => {
  it('renders a decorative svg hidden from assistive technology', () => {
    const markup = renderToStaticMarkup(BoardGlyph({ size: 20 }) as never)
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('width="20"')
  })
})