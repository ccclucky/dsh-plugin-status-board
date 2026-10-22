/**
 * Configuration defaults, bounds and tolerance of malformed input.
 */
import { describe, expect, it } from 'vitest'
import { CONFIG_DEFAULTS, CONFIG_LIMITS, isCollapseMode, resolveConfig } from '../src/shared/config.ts'

describe('resolveConfig', () => {
  it('applies documented defaults when nothing is configured', () => {
    expect(resolveConfig()).toEqual(CONFIG_DEFAULTS)
    expect(resolveConfig(null)).toEqual(CONFIG_DEFAULTS)
  })

  it('keeps every valid override', () => {
    expect(
      resolveConfig({ recentWindowHours: 72, maxRecent: 5, defaultCollapsed: 'none', showEmptyBuckets: false }),
    ).toEqual({ recentWindowHours: 72, maxRecent: 5, defaultCollapsed: 'none', showEmptyBuckets: false })
  })

  it('clamps a window below the minimum', () => {
    expect(resolveConfig({ recentWindowHours: -10 }).recentWindowHours).toBe(CONFIG_LIMITS.recentWindowHours.min)
  })

  it('clamps a window above the maximum', () => {
    expect(resolveConfig({ recentWindowHours: 100_000 }).recentWindowHours).toBe(CONFIG_LIMITS.recentWindowHours.max)
  })

  it('clamps the recent cap into range', () => {
    expect(resolveConfig({ maxRecent: 0 }).maxRecent).toBe(CONFIG_LIMITS.maxRecent.min)
    expect(resolveConfig({ maxRecent: 99_999 }).maxRecent).toBe(CONFIG_LIMITS.maxRecent.max)
  })

  it('truncates fractional numbers', () => {
    expect(resolveConfig({ recentWindowHours: 12.9 }).recentWindowHours).toBe(12)
  })

  it('falls back to defaults for values of the wrong type', () => {
    const resolved = resolveConfig({
      recentWindowHours: 'twelve' as unknown as number,
      maxRecent: Number.NaN,
      defaultCollapsed: 'everything' as never,
      showEmptyBuckets: 'yes' as unknown as boolean,
    })
    expect(resolved).toEqual(CONFIG_DEFAULTS)
  })
})

describe('isCollapseMode', () => {
  it('accepts each board id plus none and all', () => {
    for (const mode of ['decision', 'executing', 'recent', 'none', 'all']) {
      expect(isCollapseMode(mode)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    for (const mode of ['', 'both', 'unknown', null, undefined, 3]) {
      expect(isCollapseMode(mode)).toBe(false)
    }
  })
})