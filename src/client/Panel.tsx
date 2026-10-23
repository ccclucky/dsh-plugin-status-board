/**
 * The board view — rendered INSIDE the left sidebar, as a module beside the
 * workspace list, not as a full main-column page.
 *
 * Layout consequences of that destination:
 * - One column, not a responsive grid: the sidebar is ~280px wide, so a
 *   multi-column grid would collapse anyway and only waste vertical rhythm.
 * - Compact rows: a state dot, one ellipsised title line, and the relative time.
 *   The workspace path moves to the tooltip.
 * - Boards are collapsible sections with a live count, so a collapsed board
 *   still states how much it hides.
 *
 * Design notes (Nielsen's heuristics where they bite):
 * - *Visibility of system status*: counts per board, and loading is distinct
 *   from empty.
 * - *Recognition over recall*: the two boards that need attention start
 *   expanded; only the archival board starts collapsed.
 * - *Accessibility*: each section header is an `<h2>` wrapping a disclosure
 *   `<button>` (the WAI-ARIA accordion pattern), so the heading survives in the
 *   accessibility tree. `aria-controls` always resolves because the region stays
 *   mounted and is hidden with `hidden`.
 * @module dsh-plugin-status-board/client/Panel
 */

import { useEffect, useId, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import { BUCKET_IDS, type BucketId, type BoardEntry } from '../shared/types.ts'
import { bucketToggleLabel, isCollapsed, totalRows } from '../shared/board.ts'
import { createTranslate, formatRelativeTime, type MessageKey, type Translate } from '../shared/i18n.ts'
import type { BoardState, BoardStore } from './store.ts'
import { PANEL_CSS } from './styles.ts'

/** The panel's props: the store it renders plus the navigation seam. */
export interface PanelProps {
  /** The store this panel renders; created by the Client half's `apply`. */
  readonly store: BoardStore
  /**
   * Resolve the navigation seam, or `undefined` when this composition has none.
   *
   * A function rather than a captured handler: `uiWorkspace` may mount after
   * this plugin, so the render (not `apply`) has to be the moment the
   * affordance is decided.
   */
  readonly resolveNavigation?: (() => ((sessionId: string) => void) | undefined) | undefined
}

/**
 * Filter rows by a case-insensitive substring of the title.
 *
 * This module replaces the shipped workspace browser, whose search box is gone
 * with it; without a filter, a long list of sessions in a 280px column is not
 * navigable. Matching the title only is deliberate: the workspace path is not
 * rendered, so matching it would produce rows that appear to match nothing.
 */
function matchesFilter(entries: readonly BoardEntry[], query: string): readonly BoardEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return entries
  return entries.filter(entry => entry.title.toLowerCase().includes(needle))
}

/** How often relative timestamps are refreshed while nothing else changes. */
const CLOCK_INTERVAL_MS = 30_000

/**
 * A coarse clock for relative timestamps.
 *
 * The store only republishes when session data changes, so a sidebar left open
 * on an idle page would otherwise keep saying "just now" for an hour.
 */
function useRelativeClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return now
}

/** The chevron drawn by the toggle; pure markup, no icon dependency. */
function Chevron({ collapsed }: { readonly collapsed: boolean }): ReactElement {
  const style: CSSProperties = { width: 10, height: 10, display: 'block' }
  return (
    <svg
      className="status-board__chevron"
      data-collapsed={String(collapsed)}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The board's own glyph, reused by any icon surface. */
export function BoardGlyph({ size = 16 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.75 6.25h12.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 6.25v7.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="4.25" r="0.9" fill="currentColor" />
      <circle cx="6.9" cy="4.25" r="0.9" fill="currentColor" />
    </svg>
  )
}

/** One row. Exported for the view tests, which exercise the real click path. */
export function Row({
  entry,
  bucket,
  translate,
  now,
  onOpen,
}: {
  readonly entry: BoardEntry
  readonly bucket: BucketId
  readonly translate: Translate
  readonly now: number
  readonly onOpen: ((sessionId: string) => void) | undefined
}): ReactElement {
  const meta = formatRelativeTime(now, entry.lastActivityAt, translate)
  // The workspace path would cost a third column in a 280px sidebar; the native
  // tooltip carries it instead.
  const tooltip = entry.workspacePath === undefined ? entry.title : `${entry.title}\n${entry.workspacePath}`
  const metaId = `status-board-meta-${entry.id}`
  const content = [
    <span className="status-board__dot" data-state={bucket} aria-hidden="true" key="dot" />,
    <span className="status-board__row-title" key="title">
      {entry.title}
    </span>,
    <span className="status-board__row-meta" id={metaId} key="meta">
      {meta}
    </span>,
  ]

  // A row is interactive only when the profile exposes a way to open sessions;
  // otherwise it renders as static text so the affordance never lies.
  if (onOpen === undefined) {
    return (
      <li className="status-board__row" data-state={bucket} title={tooltip}>
        {content}
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className="status-board__row"
        data-state={bucket}
        title={tooltip}
        // The visible title is the accessible name; the relative time rides
        // along as the description.
        aria-label={entry.title}
        aria-describedby={metaId}
        onClick={() => onOpen(entry.id)}
      >
        {content}
      </button>
    </li>
  )
}

/** One collapsible board section. */
function Bucket({
  id,
  state,
  store,
  translate,
  now,
  query,
  onOpenSession,
}: {
  readonly id: BucketId
  readonly state: BoardState
  readonly store: BoardStore
  readonly translate: Translate
  readonly now: number
  readonly query: string
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement | null {
  const board = state.board.buckets.find(candidate => candidate.id === id)
  if (board === undefined) return null

  // One `useId` per board keeps DOM ids unique when the sidebar is torn down and
  // remounted (or two windows are open).
  const instanceId = useId()
  const headingId = `status-board-heading-${instanceId}`
  const regionId = `status-board-region-${instanceId}`

  const visible = matchesFilter(board.entries, query)
  const collapsed = isCollapsed(state.collapse, id)
  const count = visible.length
  const name = translate(`bucket.${id}` as MessageKey)
  const hint = translate(`bucket.${id}Hint` as MessageKey, { hours: state.board.windowHours })
  const unit = translate(`bucket.${id}Unit` as MessageKey)
  const filtering = query.trim().length > 0

  // While filtering, a board with no match is noise: the user asked a question
  // and this board has nothing to say about it.
  if (filtering && count === 0) return null
  // An empty board is hidden when the operator turned headers off.
  if (!filtering && count === 0 && !state.config.showEmptyBuckets) return null

  // While the list is still being enumerated, "no sessions" is not a fact yet.
  const loading = state.status === 'loading' && count === 0

  return (
    <section className="status-board__card" data-bucket={id} aria-labelledby={headingId}>
      <h2 className="status-board__heading" id={headingId}>
        <button
          type="button"
          className="status-board__toggle"
          aria-expanded={!collapsed}
          aria-controls={regionId}
          aria-label={bucketToggleLabel(translate, name, collapsed, count)}
          title={hint}
          onClick={() => store.toggle(id)}
        >
          <Chevron collapsed={collapsed} />
          <span className="status-board__name-text">{name}</span>
          {/* Small count on the header itself; the decision board additionally
              gets the large readout below, because that is the one board whose
              size is worth spending. The toggle's accessible name already states
              the number, so this is hidden from AT. */}
          <span className="status-board__count" aria-hidden="true">
            {count}
          </span>
        </button>
      </h2>
      {/* Mounted even while collapsed so `aria-controls` always resolves to a
          real element (ARIA requires IDREFs to resolve). `role="group"`, not
          `role="region"`: the module is already a landmark. */}
      <div id={regionId} role="group" aria-label={name} hidden={collapsed}>
        {/* Only the decision board states its size in words: it is the one that
            asks the user to act, so it earns the emphasis. The other two are
            lists the user scans, and a big number there would compete with the
            rows they are trying to read. */}
        {id === 'decision' && count > 0 ? (
          <>
            <p className="status-board__metric" aria-hidden="true">
              <span className="status-board__metric-n">{count}</span>
              <span className="status-board__metric-u">{unit}</span>
            </p>
            <div className="status-board__rule" aria-hidden="true" />
          </>
        ) : null}
        {loading ? null : count === 0 ? (
          <p className="status-board__empty">{translate('bucket.empty')}</p>
        ) : (
          <ul className="status-board__rows">
            {visible.map(entry => (
              <Row
                key={entry.id}
                entry={entry}
                bucket={id}
                translate={translate}
                now={now}
                onOpen={onOpenSession}
              />
            ))}
          </ul>
        )}
        {board.truncated > 0 ? (
          <p className="status-board__truncated">{translate('summary.truncated', { count: board.truncated })}</p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The board module.
 *
 * @param props - the store plus the navigation seam.
 */
export function BoardPanel({ store, resolveNavigation }: PanelProps): ReactElement {
  const onOpenSession = resolveNavigation?.()
  return <BoardPanelBody store={store} onOpenSession={onOpenSession} />
}

/** The subscribed body. */
function BoardPanelBody({
  store,
  onOpenSession,
}: {
  readonly store: BoardStore
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const now = useRelativeClock()
  const [query, setQuery] = useState('')
  const headingId = `status-board-title-${useId()}`
  const filterId = `status-board-filter-${useId()}`
  const total = totalRows(state.board)

  // How many rows survive the filter, so "no match" can be told apart from
  // "nothing here".
  const visibleTotal = BUCKET_IDS.reduce((sum, id) => {
    const board = state.board.buckets.find(candidate => candidate.id === id)
    return sum + (board === undefined ? 0 : matchesFilter(board.entries, query).length)
  }, 0)

  return (
    <div className="status-board" aria-labelledby={headingId}>
      {/* Component-local styles: React removes them when the module unmounts, so
          the plugin never leaves a global stylesheet behind. */}
      <style>{PANEL_CSS}</style>
      <div className="status-board__head">
        <h2 className="status-board__title" id={headingId}>
          {translate('panel.title')}
        </h2>
        <span className="status-board__total">{translate('summary.total', { total })}</span>
      </div>

      {/* The shipped workspace browser's search box went with it when this
          module replaced that region; a 280px column of sessions needs a
          filter to stay navigable. */}
      <label className="status-board__filter-label" htmlFor={filterId} hidden>
        {translate('action.filter')}
      </label>
      <input
        id={filterId}
        className="status-board__filter"
        type="search"
        value={query}
        placeholder={translate('action.filter')}
        aria-label={translate('action.filter')}
        onChange={event => setQuery(event.target.value)}
      />

      {/* Not retryable: the only condition that reaches this state is a
          composition with no session list at all, which the user cannot change
          from here. */}
      {state.status === 'error' ? (
        <p className="status-board__alert" role="alert">
          {translate('state.error')}
        </p>
      ) : null}

      <div className="status-board__scroll">
        {BUCKET_IDS.map(id => (
          <Bucket
            key={id}
            id={id}
            state={state}
            store={store}
            translate={translate}
            now={now}
            query={query}
            onOpenSession={onOpenSession}
          />
        ))}
      </div>

      {state.status === 'loading' && total === 0 ? (
        <p className="status-board__empty" role="status">
          {translate('state.loading')}
        </p>
      ) : null}

      {state.status === 'ready' && total === 0 ? (
        <p className="status-board__empty">{translate('state.empty')}</p>
      ) : null}

      {state.status !== 'loading' && total > 0 && visibleTotal === 0 ? (
        <p className="status-board__empty" role="status">
          {translate('state.noMatch')}
        </p>
      ) : null}
    </div>
  )
}