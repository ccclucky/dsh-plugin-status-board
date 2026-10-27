/**
 * "Completed but not yet looked at" — the platform's own reminder state.
 *
 * The Harness does not put read state on a session. What it does expose is a
 * client-side status map, published to every slot as the `useSessionStatus`
 * standard prop, whose entries carry `completionUnread`: true when a session
 * finished running, is not the session currently on screen, and has not been
 * opened since. The shipped sidebar draws a green dot for exactly this.
 *
 * Two consequences shape this module:
 *
 * - **We do not invent our own notion of unread.** Reusing the platform map means
 *   the board cannot disagree with the sidebar about what "unread" means, and we
 *   store nothing, so there is no second source of truth to drift.
 * - **It is a reminder, not a category.** The flag is set when a run finishes and
 *   cleared when the session runs again or becomes the main view, so it describes
 *   a moment of attention rather than a property of the session population. That
 *   is why it decorates rows instead of becoming a fourth board (see the ADR).
 *
 * @module dsh-plugin-status-board/client/completion-unread
 */

import { createContext, useContext } from 'react'

/** One session's status as the platform publishes it (only the field we read). */
export interface SessionStatusLike {
  readonly completionUnread?: boolean | undefined
}

/** The whole status map: session id → status. */
export type SessionStatusMap = ReadonlyMap<string, SessionStatusLike>

/**
 * The `useSessionStatus` slot hook, mirrored structurally.
 *
 * A selector hook over the status map. Mirrored rather than imported because the
 * Harness ships as a running application, not as a package this plugin can depend
 * on; a structural mirror keeps the plugin buildable on its own.
 */
export type UseSessionStatus = (selector: (map: SessionStatusMap) => SessionStatusMap) => SessionStatusMap

/** What every consumer sees when the composition does not provide the hook. */
const EMPTY: SessionStatusMap = new Map()

/** Stand-in used when the hook is absent, so the call site stays unconditional. */
const useNoStatus: UseSessionStatus = () => EMPTY

/**
 * Read the platform status map, tolerating its absence.
 *
 * The hook is optional — a test renderer, an older shell, or a different slot may
 * not provide it — but it cannot be called conditionally without breaking the
 * Rules of Hooks. Calling a constant-returning stand-in keeps the call count at
 * exactly one in every render.
 *
 * @param useSessionStatus - the hook handed down by the slot, when present.
 */
export function useSessionStatusMap(useSessionStatus?: UseSessionStatus | undefined): SessionStatusMap {
  const hook = useSessionStatus ?? useNoStatus
  return hook(map => map)
}

/**
 * The map, made available to rows without threading a prop through every layer.
 *
 * The tree and the panel are separate React roots, so each provides its own
 * value; rows read it here rather than taking another parameter.
 */
export const UnreadStatusContext = createContext<SessionStatusMap>(EMPTY)

/** Read the status map published by the nearest provider. */
export function useUnreadStatuses(): SessionStatusMap {
  return useContext(UnreadStatusContext)
}

/** Whether one session is finished-but-unopened. */
export function isCompletionUnread(statuses: SessionStatusMap, sessionId: string): boolean {
  return statuses.get(sessionId)?.completionUnread === true
}

/**
 * How many of `entries` are finished-but-unopened.
 *
 * Counted from the rows actually on screen rather than from the map: the map also
 * contains sessions this board does not show (filtered out, collapsed away, or
 * belonging to another workspace), and a header that counts rows it does not list
 * is a small lie that users notice.
 */
export function countCompletionUnread(
  statuses: SessionStatusMap,
  entries: readonly { readonly id: string }[],
): number {
  let count = 0
  for (const entry of entries) {
    if (isCompletionUnread(statuses, entry.id)) count += 1
  }
  return count
}