/**
 * Geometry and persistence for the floating entry, kept free of React.
 *
 * The entry's position is the only user-tunable geometry in the plugin, and the
 * panel derives its own placement from it, so this module owns three things and
 * nothing else:
 *
 * - where the entry was left, persisted as `{ left, top }`;
 * - how that position is clamped into the viewport;
 * - where the panel goes relative to the entry.
 *
 * Everything here is a pure function of its arguments, so the rules that are hard
 * to eyeball in a browser (what happens at the exact edge, which half flips the
 * panel) are unit-testable without a DOM.
 *
 * @module dsh-plugin-status-board/client/fab-geometry
 */

/** A point in viewport coordinates, measured to the entry's top-left corner. */
export interface FabPosition {
  readonly left: number
  readonly top: number
}

/** A box size in CSS pixels. */
export interface BoxSize {
  readonly width: number
  readonly height: number
}

/**
 * Persistence key.
 *
 * Versioned like the collapse key next to it: a future shape change bumps the
 * suffix and old data is ignored rather than misread.
 */
export const FAB_POSITION_STORAGE_KEY = 'dsh-plugin-status-board.fab.v1'

/**
 * Distance kept between the entry and the viewport edge.
 *
 * Non-zero on purpose: a button flush against the edge is hard to grab and looks
 * clipped, and a drag that overshoots should land somewhere usable rather than at
 * coordinate zero.
 */
export const FAB_EDGE_MARGIN = 8

/** Distance between the entry and the panel it opens. */
export const FAB_PANEL_GAP = 10

/** Distance the panel keeps from the viewport edge when it has to be nudged. */
export const PANEL_EDGE_MARGIN = 12

/** The minimal storage face needed (browser `localStorage` subset). */
export interface FabPositionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Narrow an untrusted value into a `FabPosition`.
 *
 * Only finite numbers are accepted. A stored `NaN`, a string, or a half-written
 * record falls back to `undefined`, which the caller reads as "never dragged" -
 * that is safer than trusting numbers that would place the entry nowhere.
 */
export function parseFabPosition(value: unknown): FabPosition | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const { left, top } = record
  if (typeof left !== 'number' || typeof top !== 'number') return undefined
  if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined
  return { left, top }
}

/** Serialize a position for persistence. */
export function serializeFabPosition(position: FabPosition): string {
  return JSON.stringify({ left: position.left, top: position.top })
}

/** Read the persisted position, or `undefined` when absent or unusable. */
export function readStoredFabPosition(storage: FabPositionStorage | undefined): FabPosition | undefined {
  if (storage === undefined) return undefined
  let raw: string | null
  try {
    raw = storage.getItem(FAB_POSITION_STORAGE_KEY)
  } catch {
    return undefined
  }
  if (raw === null) return undefined
  try {
    return parseFabPosition(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** Persist a position, swallowing storage failures (quota, private mode). */
export function writeStoredFabPosition(storage: FabPositionStorage | undefined, position: FabPosition): void {
  if (storage === undefined) return
  try {
    storage.setItem(FAB_POSITION_STORAGE_KEY, serializeFabPosition(position))
  } catch {
    // A position that cannot be saved must not break the drag in progress.
  }
}

/**
 * Forget the persisted position.
 *
 * Reset means "the key is gone", not "the default coordinates were written": a
 * stored default would make the entry indistinguishable from one the user placed
 * there, and the reset control could never become disabled again.
 */
export function clearStoredFabPosition(storage: FabPositionStorage | undefined): void {
  if (storage === undefined) return
  try {
    storage.removeItem(FAB_POSITION_STORAGE_KEY)
  } catch {
    // Same reasoning as writing: persistence is best-effort.
  }
}

/**
 * Keep the entry inside the viewport.
 *
 * Clamping is a *render* concern: callers clamp to draw and keep the unclamped
 * value in storage, so unplugging a monitor and plugging it back in restores the
 * original placement instead of permanently collapsing it to the smaller screen.
 *
 * @param position - where the user put it.
 * @param size - the entry's own box.
 * @param viewport - the visible area.
 * @param margin - gap kept from each edge.
 */
export function clampFabPosition(
  position: FabPosition,
  size: BoxSize,
  viewport: BoxSize,
  margin: number = FAB_EDGE_MARGIN,
): FabPosition {
  // When the viewport is smaller than the entry itself, `max` would be below
  // `margin` and the entry would hang off the left/top edge; clamp to the margin
  // so it stays reachable.
  const maxLeft = Math.max(margin, viewport.width - size.width - margin)
  const maxTop = Math.max(margin, viewport.height - size.height - margin)
  return {
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop),
  }
}

/** A rectangle in viewport coordinates. */
export interface ViewportRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Where the panel should be drawn, and which way it opens. */
export interface PanelPlacement {
  readonly left: number
  readonly top: number
  /**
   * True when the panel sits above the entry. Exposed rather than internal so the
   * tests can assert the flip instead of inferring it from a coordinate.
   */
  readonly opensUp: boolean
}

/**
 * Place the panel relative to the entry.
 *
 * The panel has no position of its own - this is what makes dragging the entry
 * move the panel with it. Two rules:
 *
 * 1. **Half-screen flip.** An entry in the lower half opens the panel upward and
 *    one in the upper half opens it downward. A single midpoint test covers all
 *    four quadrants; "always open upward" would push the panel off-screen as soon
 *    as the entry is dragged near the top.
 * 2. **Edge clamp.** The panel is right-aligned to the entry, then nudged inside
 *    the viewport. Dragging the entry into a corner therefore moves the panel
 *    rather than clipping it.
 *
 * `panel.height` must be the measured height. A guessed maximum leaves a visible
 * gap when the content is short, so the caller measures before calling.
 */
export function resolvePanelPlacement(
  anchor: ViewportRect,
  panel: BoxSize,
  viewport: BoxSize,
  gap: number = FAB_PANEL_GAP,
  margin: number = PANEL_EDGE_MARGIN,
): PanelPlacement {
  const opensUp = anchor.top + anchor.height / 2 > viewport.height / 2
  const left = Math.min(
    Math.max(anchor.left + anchor.width - panel.width, margin),
    Math.max(margin, viewport.width - panel.width - margin),
  )
  const top = Math.min(
    Math.max(opensUp ? anchor.top - gap - panel.height : anchor.top + anchor.height + gap, margin),
    Math.max(margin, viewport.height - panel.height - margin),
  )
  return { left, top, opensUp }
}

/** Where the default (never dragged) position sits, for tests and keyboard nav. */
export function defaultFabPosition(
  size: BoxSize,
  viewport: BoxSize,
  inset: number = 16,
): FabPosition {
  return {
    left: viewport.width - size.width - inset,
    top: viewport.height - size.height - inset,
  }
}

/**
 * Move a position by a fixed step, used by the arrow keys.
 *
 * Keyboard users cannot drag, so without this the only way to change the position
 * would be a pointer. The result is left unclamped for the caller to render-clamp,
 * exactly like a drag.
 */
export function nudgeFabPosition(position: FabPosition, dx: number, dy: number): FabPosition {
  return { left: position.left + dx, top: position.top + dy }
}