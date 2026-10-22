/**
 * The board panel: three collapsible boards, newest-first rows, responsive grid.
 *
 * Design notes (Nielsen's heuristics where they bite):
 * - *Visibility of system status*: every board carries a live row count, so a
 *   collapsed board still says how much it hides; loading and error states are
 *   distinct from "no sessions".
 * - *Recognition over recall*: the two boards that need the user (decision) or
 *   describe current work (executing) stay expanded unless configured
 *   otherwise; only the archival board starts collapsed.
 * - *Aesthetic and minimalist design*: a row shows a state dot, a title and one
 *   meta line; the workspace path is a tooltip, not a third competing column.
 * - *User control and freedom*: a failed read offers a retry instead of a dead
 *   end.
 * - *Accessibility*: each header is an `<h2>` wrapping a disclosure `<button>`
 *   (the WAI-ARIA accordion pattern), so the heading survives in the
 *   accessibility tree while the button keeps button semantics. `aria-controls`
 *   always resolves: the region stays mounted and is hidden with `hidden`.
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
   * affordance is decided. A click-time-only lookup would leave rows rendered
   * as static text forever on such a composition.
   */
  readonly resolveNavigation?: (() => ((sessionId: string) => void) | undefined) | undefined
}

/** How often relative timestamps are refreshed while nothing else changes. */
const CLOCK_INTERVAL_MS = 30_000

/**
 * A coarse clock for relative timestamps.
 *
 * The store only republishes when session data changes, so a board left open on
 * an idle page would otherwise keep saying "just now" for an hour. A 30-second
 * tick is cheap, stops on unmount, and keeps the text honest without making the
 * store own a timer.
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
  const style: CSSProperties = { width: 12, height: 12, display: 'block' }
  return (
    <svg
      className="status-board__chevron"
      data-collapsed={String(collapsed)}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The board's own glyph, reused by the sidebar panel icon. */
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
  // The workspace path is useful but would cost a third column; the native
  // tooltip carries it without competing for the row's width.
  const tooltip = entry.workspacePath === undefined ? entry.title : `${entry.title}\n${entry.workspacePath}`
  const metaId = `status-board-meta-${entry.id}`
  const content = [
    <span className="status-board__dot" aria-hidden="true" key="dot" />,
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
        // along as the description so a screen-reader user hears when the
        // session last moved.
        aria-label={entry.title}
        aria-describedby={metaId}
        onClick={() => onOpen(entry.id)}
      >
        {content}
      </button>
    </li>
  )
}

/** One board. */
function Bucket({
  id,
  state,
  store,
  translate,
  now,
  onOpenSession,
}: {
  readonly id: BucketId
  readonly state: BoardState
  readonly store: BoardStore
  readonly translate: Translate
  readonly now: number
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement | null {
  const board = state.board.buckets.find(candidate => candidate.id === id)
  if (board === undefined) return null

  // One `useId` per board keeps the DOM ids unique when two panels mount at
  // once (split view, a future right-hand dock), which a constant id cannot.
  const instanceId = useId()
  const headingId = `status-board-heading-${instanceId}`
  const regionId = `status-board-region-${instanceId}`

  const collapsed = isCollapsed(state.collapse, id)
  const count = board.entries.length
  const name = translate(`bucket.${id}` as MessageKey)
  const hint = translate(`bucket.${id}Hint` as MessageKey, { hours: state.board.windowHours })

  // An empty board is hidden when the operator turned headers off; the header
  // still renders otherwise so the three-column rhythm stays stable.
  if (count === 0 && !state.config.showEmptyBuckets) return null

  // While the list is still being enumerated, "no sessions" is not a fact yet.
  // Rendering it beside the panel's "Reading sessions…" line would tell the user
  // two contradictory things at once.
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
          onClick={() => store.toggle(id)}
        >
          <Chevron collapsed={collapsed} />
          <span className="status-board__name">{name}</span>
          <span className="status-board__count" aria-hidden="true">
            {count}
          </span>
        </button>
      </h2>
      <p className="status-board__hint">{hint}</p>
      {/* Mounted even while collapsed so `aria-controls` always resolves to a
          real element (ARIA requires IDREFs to resolve). `role="group"`, not
          `role="region"`: the card is already a landmark, and a nested region
          with the same name would be announced twice. */}
      <div id={regionId} role="group" aria-label={name} hidden={collapsed}>
        {loading ? null : count === 0 ? (
          <p className="status-board__empty">{translate('bucket.empty')}</p>
        ) : (
          <ul className="status-board__rows">
            {board.entries.map(entry => (
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
 * The board panel.
 *
 * @param props - the store plus the navigation seam.
 */
export function BoardPanel({ store, resolveNavigation }: PanelProps): ReactElement {
  // Resolved during render, not at `apply` time: `uiWorkspace` may mount after
  // this plugin, and a value captured once would permanently lock the rows into
  // their non-interactive form.
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
  const headingId = `status-board-title-${useId()}`
  const total = totalRows(state.board)

  return (
    <div className="status-board" role="region" aria-labelledby={headingId}>
      {/* Component-local styles: React removes them when the panel unmounts, so
          the plugin never leaves a global stylesheet behind. */}
      <style>{PANEL_CSS}</style>
      <div className="status-board__head">
        <div className="status-board__heading-group">
          <h1 className="status-board__title" id={headingId}>
            {translate('panel.title')}
          </h1>
          <p className="status-board__subtitle">{translate('panel.subtitle')}</p>
        </div>
        <span className="status-board__total">{translate('summary.total', { total })}</span>
      </div>

      {/* Not retryable: the only condition that reaches this state is a
          composition with no session list at all, which the user cannot change
          from here. Offering a retry button would be a dead end dressed up as
          an action. */}
      {state.status === 'error' ? (
        <p className="status-board__alert" role="alert">
          {translate('state.error')}
        </p>
      ) : null}

      <div className="status-board__grid">
        {BUCKET_IDS.map(id => (
          <Bucket
            key={id}
            id={id}
            state={state}
            store={store}
            translate={translate}
            now={now}
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
    </div>
  )
}