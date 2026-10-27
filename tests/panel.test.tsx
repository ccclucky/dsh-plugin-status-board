/**
 * Panel rendering contract.
 *
 * Rendered with `react-dom/server` so the assertions are about the DOM the
 * Harness will actually receive. The interaction tests use a real jsdom document
 * (this file opts into that environment) because a click path exercised through
 * a prop is not evidence that the wiring works.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoardPanel, BoardGlyph, Row } from '../src/client/Panel.tsx'
import { UnreadStatusContext } from '../src/client/completion-unread.ts'
import { createBoardStore } from '../src/client/store.ts'
import { createTranslate } from '../src/shared/i18n.ts'
import type { SessionListLike } from '../src/client/session-source.ts'
import type { ResolvedStatusBoardConfig } from '../src/shared/types.ts'

// React only treats `act()` as supported when this global is set; without it the
// interaction tests below warn on every dispatch and may batch differently.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = 1_700_000_000_000

/** The documented defaults, spelled out so a default change fails loudly. */
const DEFAULTS: ResolvedStatusBoardConfig = {
  recentWindowHours: 168,
  maxRecent: 20,
  defaultCollapsed: 'recent',
  showEmptyBuckets: true,
}

/** A session row with the fields the adapter reads. */
function row(id: string, title: string, overrides: Record<string, unknown> = {}) {
  // `awaitingDecision: false` is spelled out, not left undefined: the
  // classifier reads that projection, and a fixture that omits it does not
  // describe an idle session — it describes one in an unknown state.
  return { id, displayTitle: title, running: false, awaitingDecision: false, updatedAt: NOW, ...overrides }
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

/** Render the panel to static markup, optionally wiring the navigation seam. */
async function render(
  rows: Record<string, unknown>[],
  options: {
    config?: ResolvedStatusBoardConfig
    onOpenSession?: (id: string) => void
    phase?: 'pending' | 'ready'
  } = {},
): Promise<string> {
  const store = await storeFor(rows, options.config ?? DEFAULTS, options.phase ?? 'ready')
  const seam =
    options.onOpenSession === undefined ? undefined : () => options.onOpenSession
  const props = seam === undefined ? { store } : { store, resolveNavigation: seam }
  const markup = renderToStaticMarkup(createElement(BoardPanel, props))
  store.dispose()
  return markup
}

describe('completion reminder', () => {
  /** Render the panel the way the overlay mounts it: provider outside, panel inside. */
  function withStatuses(
    store: Awaited<ReturnType<typeof storeFor>>,
    map: Map<string, { completionUnread?: boolean }>,
  ): string {
    return renderToStaticMarkup(
      createElement(
        UnreadStatusContext.Provider,
        { value: map },
        createElement(BoardPanel, { store }),
      ),
    )
  }

  it('promotes an unopened completion into the dedicated unread board', async () => {
    const store = await storeFor([row('r', 'done and unseen')])
    const markup = withStatuses(store, new Map([['r', { completionUnread: true }]]))
    // Match the element, not the stylesheet: the panel inlines its own CSS, so a
    // bare `data-unopened="true"` would also match the attribute selector and the
    // assertion would pass even with no row marked.
    expect(markup).toMatch(/class="status-board-status"[^>]*data-unopened="true"/)
    // The dedicated unread board card is rendered
    expect(markup).toMatch(/data-bucket="unread"/)
    expect(markup).toContain('Completed unread')
  })

  it('leaves a plainly-seen row in recent without an unread board', async () => {
    const store = await storeFor([row('r', 'seen already')])
    const markup = withStatuses(store, new Map([['r', { completionUnread: false }]]))
    expect(markup).not.toMatch(/class="status-board-status"[^>]*data-unopened="true"/)
    expect(markup).not.toMatch(/data-bucket="unread"/)
  })

  it('renders every row when the platform provides no status hook at all', async () => {
    // The reminder is decoration, never a precondition: a composition without the
    // hook must render the same board.
    const store = await storeFor([row('r', 'no hook here')])
    const markup = renderToStaticMarkup(createElement(BoardPanel, { store }))
    expect(markup).toContain('no hook here')
    expect(markup).not.toMatch(/data-bucket="unread"/)
    expect(markup).not.toMatch(/class="status-board-status"[^>]*data-unopened="true"/)
  })

  it('displays multiple unread sessions in the unread board', async () => {
    const store = await storeFor([row('a', 'alpha done'), row('b', 'beta done')])
    const markup = withStatuses(
      store,
      new Map([
        ['a', { completionUnread: true }],
        ['b', { completionUnread: true }],
      ]),
    )
    expect(markup).toMatch(/data-bucket="unread"/)
    expect(markup).toContain('alpha done')
    expect(markup).toContain('beta done')
  })

  it('filters unread sessions through the search filter', async () => {
    const store = await storeFor([row('a', 'alpha unread'), row('b', 'beta unread')])
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const statusMap = new Map([
      ['a', { completionUnread: true }],
      ['b', { completionUnread: true }],
    ])
    act(() => {
      root.render(
        createElement(
          UnreadStatusContext.Provider,
          { value: statusMap },
          createElement(BoardPanel, { store }),
        ),
      )
    })
    const unreadSection = container.querySelector('[data-bucket="unread"]')
    expect(unreadSection?.textContent).toContain('alpha unread')
    expect(unreadSection?.textContent).toContain('beta unread')

    const input = container.querySelector<HTMLInputElement>('input.status-board__filter')
    if (input) {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, 'alpha')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(container.querySelector('[data-bucket="unread"]')?.textContent).toContain('alpha unread')
      expect(container.querySelector('[data-bucket="unread"]')?.textContent).not.toContain('beta unread')
    }
    act(() => root.unmount())
    container.remove()
  })
})

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

  it('tallies each board on its header, and states only the decision count in words', async () => {
    // Every header carries a small tally.
    const markup = await render([row('e1', 'One', { running: true }), row('e2', 'Two', { running: true })])
    expect(markup).toMatch(/status-board__count[^>]*>2</)

    // No decision sessions here, so no board states its size in words: a big
    // number on the running board would compete with the rows being scanned.
    // Strip the inlined stylesheet first — it names these classes too, so a
    // plain `toContain` would match the CSS text and prove nothing.
    const body = markup.slice(0, markup.indexOf('<style>')) + markup.slice(markup.indexOf('</style>'))
    expect(body).not.toContain('status-board__readout-n')
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
    // Three board headers plus the module title: the module is a sidebar block,
    // so its own title is an h2 rather than the h1 a full page would use.
    expect(markup.match(/<h2/g)).toHaveLength(4)
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
    expect(markup).toContain('Nothing waiting on you')
    expect(markup).toContain('Nothing running')
    expect(markup).toContain('No recent activity')
  })

  it('reports loading distinctly from empty, and never shows both', async () => {
    const markup = await render([], { phase: 'pending' })
    expect(markup).toContain('Reading sessions')
    expect(markup).not.toContain('No sessions to show yet')
    // The per-board empty state must not contradict the panel-level loading
    // line: "no sessions" is not a fact until enumeration has settled.
    expect(markup).not.toContain('Nothing waiting on you')
  })

  it('renders rows as buttons only when opening a session is wired', async () => {
    const rows = [row('e', 'Act on me', { running: true })]
    const withAction = await render(rows, { onOpenSession: () => {} })
    expect(withAction).toContain('aria-label="Act on me"')

    const withoutAction = await render(rows)
    expect(withoutAction).not.toContain('aria-label="Act on me"')
    // Only the three board toggles remain as buttons.
    expect(withoutAction.match(/<button/g)?.length).toBe(3)
  })

  it('wires the row click to the navigation seam with the session id', () => {
    // Render the ROW itself into a real DOM and click the button: an earlier
    // version of this test called the prop directly, which proved nothing about
    // the wiring it claimed to cover.
    const container = document.createElement('div')
    document.body.append(container)
    const onOpen = vi.fn()
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(
          'ul',
          null,
          createElement(Row, {
            entry: { id: 'e', title: 'Act on me', lastActivityAt: NOW },
            bucket: 'executing' as const,
            translate: createTranslate('en'),
            now: NOW,
            onOpen,
          }),
        ),
      )
    })
    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => root.unmount())
    container.remove()
    expect(onOpen).toHaveBeenCalledWith('e')
  })

  it('describes the row button with its relative time instead of hiding it', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(
          'ul',
          null,
          createElement(Row, {
            entry: { id: 'e', title: 'Act on me', lastActivityAt: NOW - 3 * 60_000 },
            bucket: 'executing' as const,
            translate: createTranslate('en'),
            now: NOW,
            onOpen: () => {},
          }),
        ),
      )
    })
    const button = container.querySelector('button')
    const describedBy = button?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    // The IDREF must resolve, and the element it names must carry the time.
    const described = container.querySelector(`#${String(describedBy)}`)
    expect(described?.textContent).toBe('3 min ago')
    expect(button?.getAttribute('aria-label')).toBe('Act on me')
    act(() => root.unmount())
    container.remove()
  })

  it('describes the row button with its relative time instead of hiding it', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(
          'ul',
          null,
          createElement(Row, {
            entry: { id: 'e', title: 'Act on me', lastActivityAt: NOW - 3 * 60_000 },
            bucket: 'executing' as const,
            translate: createTranslate('en'),
            now: NOW,
            onOpen: () => {},
          }),
        ),
      )
    })
    const button = container.querySelector('button')
    const describedBy = button?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    // The IDREF must resolve, and the element it names must carry the time.
    const described = container.querySelector(`#${String(describedBy)}`)
    expect(described?.textContent).toBe('3 min ago')
    expect(button?.getAttribute('aria-label')).toBe('Act on me')
    act(() => root.unmount())
  })

  it('takes the navigation seam as a function so a late uiWorkspace still enables rows', async () => {
    let available = false
    const onOpen = vi.fn()
    const props = { store: await storeFor([row('e', 'Later', { running: true })]), resolveNavigation: () => (available ? onOpen : undefined) }

    // Before the service mounts: static text, no fake affordance.
    const before = renderToStaticMarkup(createElement(BoardPanel, props))
    expect(before).not.toContain('aria-label="Later"')

    // After it mounts: the very next render exposes the button.
    available = true
    const after = renderToStaticMarkup(createElement(BoardPanel, props))
    expect(after).toContain('aria-label="Later"')
    props.store.dispose()
  })

  it('labels the toggle with the board, the action and the count', async () => {
    const markup = await render([row('e', 'x', { running: true })])
    expect(markup).toContain('Collapse')
    expect(markup).toContain('“Running”: 1 sessions')
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

  it('renders the three boards as labelled groups inside the sidebar module', async () => {
    const markup = await render([])
    // The module lives inside the sidebar, which is already a landmark, so it
    // claims no landmark of its own; its three boards are groups.
    expect(markup).not.toContain('role="region"')
    expect(markup).toContain('aria-labelledby="status-board-title-')
    expect(markup.match(/role="group"/g)).toHaveLength(3)
  })

  it('renders a total-session summary', async () => {
    const markup = await render([row('e1', 'a', { running: true }), row('e2', 'b', { running: true })])
    expect(markup).toContain('Sessions: 2')
  })

  it('reports how many recent rows the cap hid', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => row(`r${index}`, `Row ${index}`))
    const markup = await render(rows, { config: { ...DEFAULTS, maxRecent: 2, defaultCollapsed: 'none' } })
    expect(markup).toContain('Hidden older sessions: 3')
  })

  it('hides an empty board when the operator turned headers off', async () => {
    const cards = (markup: string): number => markup.match(/class="status-board__card"/g)?.length ?? 0
    expect(cards(await render([]))).toBe(3)
    const withoutHeaders = await render([], {
      config: { ...DEFAULTS, showEmptyBuckets: false, defaultCollapsed: 'none' },
    })
    expect(cards(withoutHeaders)).toBe(0)
  })

  it('reports a missing session list as an alert without a dead retry control', async () => {
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
    // Nothing the user can do from the panel fixes this, so no retry button.
    expect(markup).not.toContain('Retry')
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

describe('question card on a decision row', () => {
  function entryWithQuestion(state: 'open' | 'continued') {
    return {
      id: 'decision-session',
      title: 'Needs a call',
      lastActivityAt: NOW,
      questions: [
        {
          callId: 'call-1',
          state,
          questions: [
            {
              id: 'q1',
              header: 'Plan review',
              question: 'Proceed with the plan?',
              options: [{ label: 'Approve' }, { label: 'Request changes' }],
            },
          ],
        },
      ],
    }
  }

  it('expands a continued question and submits the whole batch', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const answerQuestion = vi.fn().mockResolvedValue(undefined)
    act(() => {
      root.render(
        createElement(
          'ul',
          null,
          createElement(Row, {
            entry: entryWithQuestion('continued') as never,
            bucket: 'decision' as const,
            translate: createTranslate('en'),
            now: NOW,
            onOpen: () => {},
            answerQuestion,
          }),
        ),
      )
    })
    const toggle = container.querySelector<HTMLButtonElement>('.status-board__answer-toggle')
    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    const card = container.querySelector('.status-board__qcard')
    expect(card).not.toBeNull()
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('.status-board__q-option')).find(button =>
      button.textContent?.includes('Approve'),
    )
    act(() => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.status-board__q-submit')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      await Promise.resolve()
    })
    expect(answerQuestion).toHaveBeenCalledWith('decision-session', 'call-1', {
      answers: [{ id: 'q1', selected: ['Approve'] }],
    })
    expect(container.textContent).toContain('Submitted; waiting for the agent')
    act(() => root.unmount())
    container.remove()
  })

  it('renders an open question read-only and points at the session', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(
          'ul',
          null,
          createElement(Row, {
            entry: entryWithQuestion('open') as never,
            bucket: 'decision' as const,
            translate: createTranslate('en'),
            now: NOW,
            onOpen: () => {},
            answerQuestion: vi.fn(),
          }),
        ),
      )
    })
    act(() => {
      container.querySelector<HTMLButtonElement>('.status-board__answer-toggle')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(container.textContent).toContain('still waiting in the session')
    expect(container.querySelector('.status-board__q-submit')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.status-board__q-option')?.disabled).toBe(true)
    act(() => root.unmount())
    container.remove()
  })
})
