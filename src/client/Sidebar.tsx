/**
 * The sidebar surfaces.
 *
 * DSH exposes exactly two additive seats inside the sidebar session list, and
 * this module fills both:
 *
 * 1. `sidebar.session.row.leading` — the 16px cell before a row's title. The
 *    shipped row already puts its own state dot there for a *pending
 *    interaction*, a new message, or live activity, and only falls back to this
 *    seat when its primary state is idle. So the mark here must mean something
 *    the shipped dot does not: the board a session belongs to when the row is
 *    otherwise quiet.
 * 2. `sidebar.session.row.hover` — a section of the row's hover card, between
 *    its relative time and its trailing status line. This carries the words.
 *
 * Why not a module (the earlier attempt): the sidebar's browsing region is a
 * single slot whose catalog says "declaring is claiming", and the shipped
 * `sidebar` entry claims it. A plugin cannot put a block there, and shadowing it
 * would remove the workspace list, its search, and the new-session control.
 * Decoration is the supported shape for this request.
 * @module dsh-plugin-status-board/client/Sidebar
 */

import { useSyncExternalStore, type ReactElement } from 'react'
import type { BucketId } from '../shared/types.ts'
import { createTranslate, type MessageKey } from '../shared/i18n.ts'
import type { BoardState, BoardStore } from './store.ts'

/** Bucket for one session, or `undefined` when the board does not list it. */
export function bucketOf(state: BoardState, sessionId: string): BucketId | undefined {
  for (const board of state.board.buckets) {
    if (board.entries.some(entry => entry.id === sessionId)) return board.id
  }
  return undefined
}

/** Subscribe to the board and derive one session's bucket. */
function useBucket(store: BoardStore, sessionId: string): { bucket: BucketId | undefined; state: BoardState } {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { bucket: bucketOf(state, sessionId), state }
}

/**
 * The per-row state mark.
 *
 * Rendered in the seat the shipped status dot takes when a row is idle, so it
 * must stay a *dot* — the row's own layout reserves exactly that square. Colour
 * alone is not the signal: the dot's title attribute names the board, and the
 * hover section spells it out, so the meaning survives colour-blindness.
 */
export function SessionRowMark({
  sessionId,
  store,
}: {
  readonly sessionId: string
  readonly store: BoardStore
}): ReactElement | null {
  const { bucket, state } = useBucket(store, sessionId)
  if (bucket === undefined) return null

  const translate = createTranslate(state.locale)
  const label = translate(`bucket.${bucket}` as MessageKey)

  return (
    <span
      className="status-board__mark"
      data-bond={bucket}
      title={label}
      // The glyph is decorative here: the accessible name lives on the row
      // itself, and a dot with a title is not a control.
      role="presentation"
      aria-hidden="true"
      style={{
        display: 'block',
        width: 7,
        height: 7,
        margin: '0 auto',
        borderRadius: '50%',
        background: 'var(--dsw-alias-label-secondary)',
      }}
    />
  )
}

/**
 * The hover-card section: the board name plus, when it is the decision board, a
 * sentence saying what is waiting.
 */
export function SessionRowDetail({
  sessionId,
  store,
}: {
  readonly sessionId: string
  readonly store: BoardStore
}): ReactElement | null {
  const { bucket, state } = useBucket(store, sessionId)
  if (bucket === undefined) return null

  const translate = createTranslate(state.locale)

  return (
    <div className="status-board__detail" style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{translate('detail.label')}</span>
      <span>{translate(`bucket.${bucket}` as MessageKey)}</span>
    </div>
  )
}