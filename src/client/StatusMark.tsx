/**
 * The shared status marker.
 *
 * A plain dot cannot say whether a session is waiting on a human, still working,
 * or merely recent. This marker uses one shape language across the sidebar tree
 * and the floating board:
 *
 * - decision: a solid dot inside a slow breathing halo (a session uses a hollow
 *   breathing ring, a softer variant of the same amber);
 * - executing: a spinning arc; a directory keeps a solid blue core, a session
 *   uses the arc alone;
 * - recent: a static dot (directory) or a hollow ring (session), grey.
 *
 * The directory mark is the stronger, filled variant; the session mark is the
 * hollow/soft variant of the same hue, so the hierarchy is readable without
 * introducing a second palette. Animation is never the only signal: the folder
 * name, row title and counts carry the text meaning, and reduced motion leaves
 * every shape in a readable static state.
 * @module dsh-plugin-status-board/client/StatusMark
 */

import type { ReactElement } from 'react'
import type { BucketId } from '../shared/types.ts'

/** Visual weight of one marker. */
export type StatusMarkVariant = 'folder' | 'row'

/**
 * One decorative status marker.
 *
 * `unopened` adds the platform's completion reminder as a corner dot rather than
 * changing the marker's own shape: the two facts are independent (a session can be
 * waiting on the user *and* have finished a run they have not looked at), so
 * replacing one with the other would lose information.
 *
 * @param props - the board it represents, its visual weight, and the reminder flag.
 */
export function StatusMark({
  bucket,
  variant,
  empty = false,
  unopened = false,
}: {
  readonly bucket: BucketId
  readonly variant: StatusMarkVariant
  /** A directory with no sessions stays still and dimmed; the state is not live. */
  readonly empty?: boolean | undefined
  /** Finished running and not opened since. Session rows only. */
  readonly unopened?: boolean | undefined
}): ReactElement {
  return (
    <span
      className="status-board-status"
      data-bucket={bucket}
      data-variant={variant}
      data-empty={empty}
      data-unopened={unopened}
      aria-hidden="true"
    />
  )
}
