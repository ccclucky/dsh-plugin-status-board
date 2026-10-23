/**
 * Configuration resolution.
 *
 * The Loader validates the row's `Config` schema before activation, so this
 * module only has to apply the same defaults for direct callers (tests, and
 * the Client half's fallback when it cannot reach the Host). Values are
 * clamped, not rejected: a hand-edited patch must never keep the panel from
 * rendering.
 * @module dsh-plugin-status-board/shared/config
 */

import { BUCKET_IDS, type CollapseMode, type ResolvedStatusBoardConfig, type StatusBoardConfig } from './types.ts'

/** Hard bounds used by both the schema and the resolver. */
export const CONFIG_LIMITS = {
  recentWindowHours: { min: 1, max: 720 },
  maxRecent: { min: 1, max: 200 },
} as const

/** Defaults documented in README.md and used when a field is absent. */
export const CONFIG_DEFAULTS = {
  recentWindowHours: 168,
  maxRecent: 20,
  defaultCollapsed: 'recent' as CollapseMode,
  showEmptyBuckets: true,
} as const

/** Clamp an unknown number into an inclusive integer range. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

/** Whether `value` names a board, `none`, or `all`. */
export function isCollapseMode(value: unknown): value is CollapseMode {
  return value === 'none' || value === 'all' || (typeof value === 'string' && (BUCKET_IDS as readonly string[]).includes(value))
}

/**
 * Apply defaults and bounds to a raw configuration object.
 *
 * @param raw - the row's `config` (may be `undefined` when the Loader supplies
 *   no configuration at all).
 * @returns a complete, immutable configuration.
 */
export function resolveConfig(raw?: StatusBoardConfig | null): ResolvedStatusBoardConfig {
  return {
    recentWindowHours: clampInt(
      raw?.recentWindowHours,
      CONFIG_DEFAULTS.recentWindowHours,
      CONFIG_LIMITS.recentWindowHours.min,
      CONFIG_LIMITS.recentWindowHours.max,
    ),
    maxRecent: clampInt(raw?.maxRecent, CONFIG_DEFAULTS.maxRecent, CONFIG_LIMITS.maxRecent.min, CONFIG_LIMITS.maxRecent.max),
    defaultCollapsed: isCollapseMode(raw?.defaultCollapsed) ? raw.defaultCollapsed : CONFIG_DEFAULTS.defaultCollapsed,
    showEmptyBuckets: typeof raw?.showEmptyBuckets === 'boolean' ? raw.showEmptyBuckets : CONFIG_DEFAULTS.showEmptyBuckets,
  }
}