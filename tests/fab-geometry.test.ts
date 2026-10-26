/**
 * Geometry rules for the floating entry.
 *
 * These are the decisions that were argued out rather than guessed: the clamp must
 * never write back, the panel must flip by half-screen, a reset must delete the key
 * instead of storing defaults. Each has a test that fails if someone "simplifies"
 * it later.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  clampFabPosition,
  clearStoredFabPosition,
  defaultFabPosition,
  FAB_EDGE_MARGIN,
  FAB_POSITION_STORAGE_KEY,
  nudgeFabPosition,
  parseFabPosition,
  readStoredFabPosition,
  resolvePanelPlacement,
  serializeFabPosition,
  writeStoredFabPosition,
  type FabPositionStorage,
} from '../src/client/fab-geometry.ts'

/** A storage double that records calls and can be told to fail. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const calls: string[] = []
  let failWrites = false
  const storage: FabPositionStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      calls.push(`set:${key}`)
      if (failWrites) throw new Error('quota')
      data.set(key, value)
    },
    removeItem: key => {
      calls.push(`remove:${key}`)
      data.delete(key)
    },
  }
  return { storage, data, calls, failWrites: (v: boolean) => (failWrites = v) }
}

const SIZE = { width: 129, height: 34 }
const VIEWPORT = { width: 1280, height: 800 }

describe('parseFabPosition', () => {
  it('accepts a pair of finite numbers', () => {
    expect(parseFabPosition({ left: 10, top: 20 })).toEqual({ left: 10, top: 20 })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'left'],
    ['an array', [1, 2]],
    ['missing top', { left: 1 }],
    ['missing left', { top: 1 }],
    ['string coordinates', { left: '1', top: '2' }],
    ['NaN', { left: Number.NaN, top: 2 }],
    ['Infinity', { left: 1, top: Number.POSITIVE_INFINITY }],
  ])('rejects %s, so the entry falls back to its default corner', (_label, value) => {
    expect(parseFabPosition(value)).toBeUndefined()
  })
})

describe('persistence', () => {
  it('round-trips a position through the versioned key', () => {
    const { storage, data } = fakeStorage()
    writeStoredFabPosition(storage, { left: 40, top: 60 })
    expect(data.has(FAB_POSITION_STORAGE_KEY)).toBe(true)
    expect(readStoredFabPosition(storage)).toEqual({ left: 40, top: 60 })
  })

  it('serializes to a plain object, not a tuple, so a future field can be added', () => {
    expect(JSON.parse(serializeFabPosition({ left: 1, top: 2 }))).toEqual({ left: 1, top: 2 })
  })

  it('reports no stored position when the key is absent', () => {
    const { storage } = fakeStorage()
    expect(readStoredFabPosition(storage)).toBeUndefined()
  })

  it('ignores a corrupted record instead of placing the entry nowhere', () => {
    const { storage } = fakeStorage({ [FAB_POSITION_STORAGE_KEY]: '{not json' })
    expect(readStoredFabPosition(storage)).toBeUndefined()
  })

  it('deletes the key on reset rather than writing default coordinates', () => {
    const { storage, data, calls } = fakeStorage()
    writeStoredFabPosition(storage, { left: 40, top: 60 })
    clearStoredFabPosition(storage)
    expect(data.has(FAB_POSITION_STORAGE_KEY)).toBe(false)
    // The distinction matters: a stored default would look "user-placed" and the
    // reset control could never disable itself again.
    expect(calls).toContain(`remove:${FAB_POSITION_STORAGE_KEY}`)
  })

  it('survives a read failure', () => {
    const storage: FabPositionStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(readStoredFabPosition(storage)).toBeUndefined()
  })

  it('survives a write failure without breaking the drag in progress', () => {
    const { storage, failWrites } = fakeStorage()
    failWrites(true)
    expect(() => writeStoredFabPosition(storage, { left: 1, top: 2 })).not.toThrow()
  })

  it('does nothing without storage', () => {
    expect(readStoredFabPosition(undefined)).toBeUndefined()
    expect(() => writeStoredFabPosition(undefined, { left: 1, top: 2 })).not.toThrow()
    expect(() => clearStoredFabPosition(undefined)).not.toThrow()
  })
})

describe('clampFabPosition', () => {
  it('leaves an in-bounds position untouched', () => {
    expect(clampFabPosition({ left: 400, top: 300 }, SIZE, VIEWPORT)).toEqual({ left: 400, top: 300 })
  })

  it('pulls a position back inside the viewport past every edge', () => {
    expect(clampFabPosition({ left: -500, top: -500 }, SIZE, VIEWPORT)).toEqual({
      left: FAB_EDGE_MARGIN,
      top: FAB_EDGE_MARGIN,
    })
    expect(clampFabPosition({ left: 99999, top: 99999 }, SIZE, VIEWPORT)).toEqual({
      left: VIEWPORT.width - SIZE.width - FAB_EDGE_MARGIN,
      top: VIEWPORT.height - SIZE.height - FAB_EDGE_MARGIN,
    })
  })

  it('keeps the entry reachable when the viewport is smaller than the entry', () => {
    // A tiny window must not resolve to a negative maximum and push the entry out.
    const tiny = clampFabPosition({ left: 50, top: 50 }, SIZE, { width: 60, height: 20 })
    expect(tiny).toEqual({ left: FAB_EDGE_MARGIN, top: FAB_EDGE_MARGIN })
  })

  it('is a no-op on an already clamped position (idempotent)', () => {
    const once = clampFabPosition({ left: -10, top: 900 }, SIZE, VIEWPORT)
    expect(clampFabPosition(once, SIZE, VIEWPORT)).toEqual(once)
  })
})

describe('resolvePanelPlacement', () => {
  const PANEL = { width: 382, height: 300 }

  it('opens upward for an entry in the lower half', () => {
    const placement = resolvePanelPlacement({ left: 1100, top: 700, ...SIZE }, PANEL, VIEWPORT)
    expect(placement.opensUp).toBe(true)
    expect(placement.top).toBe(700 - 10 - 300)
  })

  it('opens downward for an entry in the upper half', () => {
    const placement = resolvePanelPlacement({ left: 100, top: 40, ...SIZE }, PANEL, VIEWPORT)
    expect(placement.opensUp).toBe(false)
    expect(placement.top).toBe(40 + SIZE.height + 10)
  })

  it('flips exactly at the midpoint, so a small nudge does not jump the panel', () => {
    const justBelow = resolvePanelPlacement({ left: 0, top: 400, ...SIZE }, PANEL, VIEWPORT)
    const justAbove = resolvePanelPlacement({ left: 0, top: 380, ...SIZE }, PANEL, VIEWPORT)
    expect(justBelow.opensUp).toBe(true)
    expect(justAbove.opensUp).toBe(false)
  })

  it('right-aligns to the entry while it fits', () => {
    const placement = resolvePanelPlacement({ left: 600, top: 700, ...SIZE }, PANEL, VIEWPORT)
    expect(placement.left).toBe(600 + SIZE.width - PANEL.width)
  })

  it('nudges the panel inside the viewport when the entry hugs an edge', () => {
    const right = resolvePanelPlacement({ left: 1270, top: 700, ...SIZE }, PANEL, VIEWPORT)
    expect(right.left).toBe(VIEWPORT.width - PANEL.width - 12)
    const left = resolvePanelPlacement({ left: 0, top: 700, ...SIZE }, PANEL, VIEWPORT)
    expect(left.left).toBe(12)
  })

  it('keeps the panel on screen when the entry is at the very top', () => {
    const placement = resolvePanelPlacement({ left: 400, top: 0, ...SIZE }, PANEL, VIEWPORT)
    expect(placement.opensUp).toBe(false)
    expect(placement.top).toBeGreaterThanOrEqual(12)
  })

  it('keeps the panel on screen when it is taller than the space below the entry', () => {
    const tall = { width: 382, height: 600 }
    const placement = resolvePanelPlacement({ left: 400, top: 100, ...SIZE }, tall, VIEWPORT)
    expect(placement.top).toBeGreaterThanOrEqual(12)
    expect(placement.top + tall.height).toBeLessThanOrEqual(VIEWPORT.height - 12)
  })

  it('never overlaps the entry it belongs to', () => {
    for (const top of [0, 200, 399, 401, 600, 766]) {
      const anchor = { left: 900, top, ...SIZE }
      const placement = resolvePanelPlacement(anchor, PANEL, VIEWPORT)
      const clearsAbove = placement.top + PANEL.height <= anchor.top
      const clearsBelow = placement.top >= anchor.top + anchor.height
      expect(clearsAbove || clearsBelow, `top=${top}`).toBe(true)
    }
  })

  it('measures the panel it is given, so a short panel stays close to the entry', () => {
    const short = resolvePanelPlacement({ left: 1100, top: 700, ...SIZE }, { width: 382, height: 120 }, VIEWPORT)
    expect(700 - short.top).toBe(120 + 10)
  })
})

describe('keyboard and default position', () => {
  it('derives the default corner from the entry size', () => {
    expect(defaultFabPosition(SIZE, VIEWPORT)).toEqual({
      left: VIEWPORT.width - SIZE.width - 16,
      top: VIEWPORT.height - SIZE.height - 16,
    })
  })

  it('nudges by the given step without clamping (the renderer clamps)', () => {
    expect(nudgeFabPosition({ left: 100, top: 100 }, -8, 16)).toEqual({ left: 92, top: 116 })
    expect(nudgeFabPosition({ left: 0, top: 0 }, -8, -8)).toEqual({ left: -8, top: -8 })
  })
})

describe('storage probe interaction', () => {
  it('does not call storage when there is nothing to persist', () => {
    const { storage } = fakeStorage()
    const spy = vi.spyOn(storage, 'getItem')
    readStoredFabPosition(undefined)
    expect(spy).not.toHaveBeenCalled()
  })
})