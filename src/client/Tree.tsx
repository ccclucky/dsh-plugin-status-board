/**
 * The sidebar's inline status tree.
 *
 * This surface is deliberately a *navigation* tree, not a board: it mirrors the
 * Workspace browser's click contract (click a session row → open that session)
 * and renders no approval or answer controls. Question cards live in the
 * floating board (entry ②), where there is room for them.
 *
 * Shape: one disclosure per board, each containing the sessions classified into
 * that board. The three boards double as the three "project" folders the user
 * asked for, so the tree needs no separate grouping layer.
 *
 * The component is rendered through a portal into the sidebar's `nav` (see
 * `overlay.tsx`); it therefore inherits the sidebar's width and theme instead of
 * being a floating surface.
 * @module dsh-plugin-status-board/client/Tree
 */

import { useSyncExternalStore, type ReactElement } from 'react'
import { BUCKET_IDS, type BoardEntry, type BucketId } from '../shared/types.ts'
import { bucketToggleLabel, isCollapsed } from '../shared/board.ts'
import { createTranslate, formatRelativeTime, recentWindowHint, type Translate } from '../shared/i18n.ts'
import type { BoardStore } from './store.ts'
import { Chevron, useRelativeClock } from './Panel.tsx'
import { StatusMark } from './StatusMark.tsx'
import { PANEL_CSS } from './styles.ts'

/** The tree's props: the store it renders and the navigation seam. */
export interface TreeProps {
  readonly store: BoardStore
  /**
   * Resolve the navigation seam at render time, so a late `uiWorkspace` still
   * turns rows into links. Without it rows are static text, never fake buttons.
   */
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}

/** One session row in a folder. */
function TreeRow({
  entry,
  bucket,
  translate,
  now,
  onOpenSession,
}: {
  readonly entry: BoardEntry
  readonly bucket: BucketId
  readonly translate: Translate
  readonly now: number
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement {
  const time = formatRelativeTime(now, entry.lastActivityAt, translate)
  const tooltip = entry.workspacePath === undefined ? entry.title : `${entry.title}\n${entry.workspacePath}`
  const content = [
    <StatusMark bucket={bucket} variant="row" key="dot" />,
    <span className="status-board-tree__title" key="title">
      {entry.title}
    </span>,
    <span className="status-board-tree__time" key="time">
      {time}
    </span>,
  ]
  if (onOpenSession === undefined) {
    return (
      <li>
        <div className="status-board-tree__row" title={tooltip}>
          {content}
        </div>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className="status-board-tree__row"
        title={tooltip}
        aria-label={translate('tree.session', { name: entry.title })}
        onClick={() => onOpenSession(entry.id)}
      >
        {content}
      </button>
    </li>
  )
}

/** One collapsible status folder. */
function TreeFolder({
  id,
  store,
  translate,
  now,
  onOpenSession,
}: {
  readonly id: BucketId
  readonly store: BoardStore
  readonly translate: Translate
  readonly now: number
  readonly onOpenSession: ((sessionId: string) => void) | undefined
}): ReactElement | null {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const board = state.board.buckets.find(candidate => candidate.id === id)
  if (board === undefined) return null
  const collapsed = isCollapsed(state.collapse, id)
  const name = translate(`bucket.${id}`)
  const hint = id === 'recent'
    ? recentWindowHint(state.board.windowHours, translate)
    : translate(`bucket.${id}Hint`, { hours: state.board.windowHours })
  const empty = translate(`bucket.${id}Empty`)
  const count = board.entries.length
  const regionId = `status-board-tree-region-${id}`
  const loading = state.status === 'loading' && count === 0

  return (
    <section className="status-board-tree__folder" data-bucket={id} data-count-empty={count === 0}>
      <h3 className="status-board-tree__heading">
        <button
          type="button"
          className="status-board-tree__toggle"
          aria-expanded={!collapsed}
          aria-controls={regionId}
          aria-label={bucketToggleLabel(translate, name, collapsed, count)}
          title={hint}
          onClick={() => store.toggle(id)}
        >
          <Chevron collapsed={collapsed} />
          <StatusMark bucket={id} variant="folder" empty={count === 0} />
          <span className="status-board-tree__name">{name}</span>
          <span className="status-board-tree__count" aria-hidden="true">
            {count}
          </span>
        </button>
      </h3>
      {/* Mounted while collapsed so aria-controls always resolves. */}
      <div id={regionId} role="group" aria-label={name} hidden={collapsed}>
        {loading ? null : count === 0 ? (
          <p className="status-board-tree__empty">{empty}</p>
        ) : (
          <ul className="status-board-tree__rows">
            {board.entries.map(entry => (
              <TreeRow
                key={entry.id}
                entry={entry}
                bucket={id}
                translate={translate}
                now={now}
                onOpenSession={onOpenSession}
              />
            ))}
          </ul>
        )}
        {board.truncated > 0 ? (
          <p className="status-board-tree__truncated">{translate('summary.truncated', { count: board.truncated })}</p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The inline tree.
 *
 * @param props - the store plus the navigation seam.
 */
export function StatusTree({ store, onOpenSession }: TreeProps): ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const translate = createTranslate(state.locale)
  const now = useRelativeClock()

  return (
    <div className="status-board-tree" role="group" aria-label={translate('tree.label')}>
      {/* The tree lives in the sidebar, outside the floating popover. It carries
          its own copy of the stylesheet so a broken/unmounted overlay cannot
          leave default browser buttons in the navigation. */}
      <style>{PANEL_CSS}</style>
      {state.status === 'error' ? (
        <p className="status-board-tree__alert" role="alert">
          {translate('state.error')}
        </p>
      ) : null}
      {state.status === 'loading' ? (
        <p className="status-board-tree__empty" role="status">
          {translate('state.loading')}
        </p>
      ) : null}
      {BUCKET_IDS.map(id => (
        <TreeFolder key={id} id={id} store={store} translate={translate} now={now} onOpenSession={onOpenSession} />
      ))}
    </div>
  )
}
