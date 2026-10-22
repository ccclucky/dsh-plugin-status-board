/**
 * The board panel: three collapsible boards, newest-first rows, responsive grid.
 *
 * Design notes (Nielsen's heuristics where they bite):
 * - *Visibility of system status*: every board carries a live row count, so a
 *   collapsed board still tells the user how much it hides.
 * - *Recognition over recall*: the two boards that need the user (decision) or
 *   describe current work (executing) are always expanded unless configured
 *   otherwise; only the archival board starts collapsed.
 * - *Aesthetic and minimalist design*: a row shows a state dot, a title and one
 *   meta line; the workspace path is a tooltip, not a third competing column.
 * - *Accessibility*: the toggle is a real `<button>` with `aria-expanded` and
 *   `aria-controls`; the label names the board, the action and the count.
 * @module dsh-plugin-status-board/client/Panel
 */

import { useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import { BUCKET_IDS, type BucketId, type BoardEntry } from '../shared/types.ts'
import { createTranslate, formatRelativeTime, type MessageKey, type Translate } from '../shared/i18n.ts'
import type { BoardStore, BoardState } from './store.ts'
import { PANEL_CSS } from './styles.ts'

/** Owner props the panel receives. */
export interface PanelProps {
  /** The store this panel renders; created by the Client half's `apply`. */
  readonly store: BoardStore
  /** Open one session in the main column. */
  readonly onOpenSession?: ((sessionId: string) => void) | undefined
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

/** One row. */
function Row({
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
  const title = entry.workspacePath === undefined ? entry.title : `${entry.title}\n${entry.workspacePath}`
  const content = [
    <span className="status-board__dot" aria-hidden="true" key="dot" />,
    <span className="status-board__row-title" title={title} key="title">
      {entry.title}
    </span>,
    <span className="status-board__row-meta" key="meta">
      {meta}
    </span>,
  ]

  // A row is only interactive when the profile exposes a way to open sessions;
  // otherwise it renders as static text so the affordance never lies.
  if (onOpen === undefined) {
    return (
      <li className="status-board__row" data-state={bucket} title={title}>
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
        title={title}
        aria-label={`${translate('action.open')}: ${entry.title}`}
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
  onOpenSession,
}: {
  readonly id: BucketId
  readonly state: BoardState
  readonly store: BoardStore
  readonly translate: Translate
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement | null {
  const index = BUCKET_IDS.indexOf(id)
  const board = state.board.buckets[index]
  if (board === undefined) return null

  const collapsed = state.collapse[id]
  const count = board.entries.length
  const name = translate(`bucket.${id}` as MessageKey)
  const hintKey = (`bucket.${id}Hint`) as MessageKey
  const hint = translate(hintKey, { hours: state.board.windowHours })
  const regionId = `status-board-region-${id}`

  // An empty board is hidden when the operator turned headers off; the header
  // still renders otherwise so the three-column rhythm stays stable.
  if (count === 0 && !state.config.showEmptyBuckets) return null

  const label = translate(collapsed ? 'bucket.expand' : 'bucket.collapse', { name, count })

  return (
    <section className="status-board__card" data-bucket={id} aria-labelledby={`status-board-heading-${id}`}>
      <button
        type="button"
        className="status-board__toggle"
        aria-expanded={!collapsed}
        aria-controls={regionId}
        aria-label={label}
        onClick={() => store.toggle(id)}
      >
        <Chevron collapsed={collapsed} />
        <span className="status-board__name" id={`status-board-heading-${id}`} role="heading" aria-level={2}>
          {name}
        </span>
        <span className="status-board__count" aria-hidden="true">
          {count}
        </span>
      </button>
      <p className="status-board__hint">{hint}</p>
      {collapsed ? null : (
        <div id={regionId} role="region" aria-label={name}>
          {count === 0 ? (
            <p className="status-board__empty">{translate('bucket.empty')}</p>
          ) : (
            <ul className="status-board__rows">
              {board.entries.map(entry => (
                <Row
                  key={entry.id}
                  entry={entry}
                  bucket={id}
                  translate={translate}
                  now={state.board.generatedAt}
                  onOpen={onOpenSession}
                />
              ))}
            </ul>
          )}
          {board.truncated > 0 ? (
            <p className="status-board__truncated">{translate('summary.truncated', { count: board.truncated })}</p>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * The panel component.
 *
 * The store arrives as a prop rather than through a module-level handle: a
 * module singleton would be wrong on two counts — it breaks when two panel
 * instances mount (a split view), and it leaves a stale store behind after an
 * HMR reload. The Client half closes over the store it created in `apply`, so
 * the panel always reads the live one.
 *
 * @param props - the store plus owner-supplied seams.
 */
export function BoardPanel({ store, onOpenSession }: PanelProps): ReactElement {
  return <BoardPanelBody store={store} onOpenSession={onOpenSession} />
}

/**
 * The subscribed body.
 *
 * Split from {@link BoardPanel} because `useSyncExternalStore` may not run
 * conditionally, and the store can legitimately be absent while the Client half
 * is still wiring itself up.
 */
function BoardPanelBody({
  store,
  onOpenSession,
}: {
  readonly store: BoardStore
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const headingId = 'status-board-title'

  const total = BUCKET_IDS.reduce((sum, id) => sum + state.board.counts[id], 0)

  return (
    <div className="status-board" role="region" aria-labelledby={headingId} aria-label={translate('a11y.panel')}>
      {/* Component-local styles: React removes them when the panel unmounts, so
          the plugin never leaves a global stylesheet behind. */}
      <style>{PANEL_CSS}</style>
      <div className="status-board__head">
        <div className="status-board__heading">
          <h1 className="status-board__title" id={headingId}>
            {translate('panel.title')}
          </h1>
          <p className="status-board__subtitle">{translate('panel.subtitle')}</p>
        </div>
        <span className="status-board__total">{translate('summary.total', { total })}</span>
      </div>

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
            onOpenSession={onOpenSession}
          />
        ))}
      </div>

      {total === 0 && state.status === 'ready' ? (
        <p className="status-board__empty">{translate('state.empty')}</p>
      ) : null}
    </div>
  )
}