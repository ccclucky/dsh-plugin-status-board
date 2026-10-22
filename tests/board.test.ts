/**
 * Board classification, ordering, windowing, capping and collapse state.
 *
 * These tests pin the delivery contract from the README: which board a Session
 * lands in, the order rows appear in, and how the `recent` cap behaves.
 */
import { describe, expect, it } from 'vitest'
import {
  bucketToggleLabel,
  buildBoard,
  classifySession,
  compareByRecency,
  isCollapsed,
  isWithinWindow,
  resolveCollapse,
  toggleCollapse,
  totalRows,
} from '../src/shared/board.ts'
import type { SessionSignal } from '../src/shared/types.ts'

const HOUR = 3_600_000
const NOW = 1_700_000_000_000

/** Build a SessionSignal with sensible defaults so each test states one fact. */
function signal(overrides: Partial<SessionSignal> & { id: string }): SessionSignal {
  return {
    title: overrides.id,
    running: false,
    awaitingDecision: false,
    lastActivityAt: NOW,
    ...overrides,
  }
}

describe('classifySession', () => {
  it('puts a session awaiting a decision in the decision board even while running', () => {
    expect(classifySession(signal({ id: 'a', running: true, awaitingDecision: true }))).toBe('decision')
  })

  it('puts a running session in the executing board', () => {
    expect(classifySession(signal({ id: 'a', running: true }))).toBe('executing')
  })

  it('puts an idle session in the recent board', () => {
    expect(classifySession(signal({ id: 'a' }))).toBe('recent')
  })
})

describe('compareByRecency', () => {
  it('orders newest first', () => {
    const older = signal({ id: 'old', lastActivityAt: NOW - HOUR })
    const newer = signal({ id: 'new', lastActivityAt: NOW })
    expect([older, newer].sort(compareByRecency).map(s => s.id)).toEqual(['new', 'old'])
  })

  it('breaks timestamp ties by id so the order is stable', () => {
    const b = signal({ id: 'b', lastActivityAt: NOW })
    const a = signal({ id: 'a', lastActivityAt: NOW })
    expect([b, a].sort(compareByRecency).map(s => s.id)).toEqual(['a', 'b'])
  })
})

describe('isWithinWindow', () => {
  it('keeps a timestamp inside the window', () => {
    expect(isWithinWindow(signal({ id: 'a', lastActivityAt: NOW - 2 * HOUR }), NOW, 24)).toBe(true)
  })

  it('drops a timestamp outside the window', () => {
    expect(isWithinWindow(signal({ id: 'a', lastActivityAt: NOW - 48 * HOUR }), NOW, 24)).toBe(false)
  })

  it('keeps a session whose timestamp is unknown rather than hiding it', () => {
    expect(isWithinWindow(signal({ id: 'a', lastActivityAt: 0 }), NOW, 24)).toBe(true)
    expect(isWithinWindow(signal({ id: 'a', lastActivityAt: Number.NaN }), NOW, 24)).toBe(true)
  })
})

describe('buildBoard', () => {
  it('always returns all three boards in declaration order', () => {
    const board = buildBoard([], { recentWindowHours: 24, maxRecent: 20 }, NOW)
    expect(board.buckets.map(b => b.id)).toEqual(['decision', 'executing', 'recent'])
  })

  it('routes each session to exactly one board and counts them', () => {
    const board = buildBoard(
      [
        signal({ id: 'd1', awaitingDecision: true }),
        signal({ id: 'e1', running: true }),
        signal({ id: 'r1' }),
      ],
      { recentWindowHours: 24, maxRecent: 20 },
      NOW,
    )
    expect(board.counts).toEqual({ decision: 1, executing: 1, recent: 1 })
    expect(board.buckets.flatMap(b => b.entries.map(e => e.id))).toEqual(['d1', 'e1', 'r1'])
  })

  it('orders each board newest first', () => {
    const board = buildBoard(
      [
        signal({ id: 'old', running: true, lastActivityAt: NOW - HOUR }),
        signal({ id: 'new', running: true, lastActivityAt: NOW }),
      ],
      { recentWindowHours: 24, maxRecent: 20 },
      NOW,
    )
    expect(board.buckets[1]?.entries.map(e => e.id)).toEqual(['new', 'old'])
  })

  it('applies the window only to the recent board', () => {
    const board = buildBoard(
      [
        signal({ id: 'stale-decision', awaitingDecision: true, lastActivityAt: NOW - 100 * HOUR }),
        signal({ id: 'stale-running', running: true, lastActivityAt: NOW - 100 * HOUR }),
        signal({ id: 'stale-recent', lastActivityAt: NOW - 100 * HOUR }),
      ],
      { recentWindowHours: 24, maxRecent: 20 },
      NOW,
    )
    expect(board.counts).toEqual({ decision: 1, executing: 1, recent: 0 })
  })

  it('caps the recent board and reports how many rows it hid', () => {
    const signals = Array.from({ length: 5 }, (_, index) =>
      signal({ id: `r${index}`, lastActivityAt: NOW - index * 1000 }),
    )
    const board = buildBoard(signals, { recentWindowHours: 24, maxRecent: 2 }, NOW)
    const recent = board.buckets[2]
    expect(recent?.entries.map(e => e.id)).toEqual(['r0', 'r1'])
    expect(recent?.truncated).toBe(3)
    expect(board.counts.recent).toBe(2)
  })

  it('never truncates the decision or executing boards', () => {
    const signals = Array.from({ length: 5 }, (_, index) => signal({ id: `d${index}`, awaitingDecision: true }))
    const board = buildBoard(signals, { recentWindowHours: 24, maxRecent: 1 }, NOW)
    expect(board.counts.decision).toBe(5)
    expect(board.buckets[0]?.truncated).toBe(0)
  })

  it('clamps non-positive configuration instead of hiding every session', () => {
    const board = buildBoard([signal({ id: 'r1' })], { recentWindowHours: 0, maxRecent: 0 }, NOW)
    expect(board.counts.recent).toBe(1)
    expect(board.windowHours).toBe(1)
  })

  it('carries the workspace path through to the row', () => {
    const board = buildBoard(
      [signal({ id: 'r1', workspacePath: 'D:/work/app' })],
      { recentWindowHours: 24, maxRecent: 20 },
      NOW,
    )
    expect(board.buckets[2]?.entries[0]?.workspacePath).toBe('D:/work/app')
  })
})

describe('totalRows', () => {
  it('sums the visible rows across every board', () => {
    const board = buildBoard(
      [signal({ id: 'd', awaitingDecision: true }), signal({ id: 'e', running: true }), signal({ id: 'r' })],
      { recentWindowHours: 24, maxRecent: 20 },
      NOW,
    )
    expect(totalRows(board)).toBe(3)
  })
})

describe('collapse state', () => {
  it('starts only the recent board collapsed by default', () => {
    expect(resolveCollapse('recent')).toEqual({ decision: false, executing: false, recent: true })
  })

  it('starts every board collapsed for "all"', () => {
    expect(resolveCollapse('all')).toEqual({ decision: true, executing: true, recent: true })
  })

  it('starts no board collapsed for "none"', () => {
    expect(resolveCollapse('none')).toEqual({ decision: false, executing: false, recent: false })
  })

  it('toggles one board without touching the others', () => {
    const initial = resolveCollapse('none')
    const next = toggleCollapse(initial, 'executing')
    expect(isCollapsed(next, 'executing')).toBe(true)
    expect(isCollapsed(next, 'decision')).toBe(false)
    expect(isCollapsed(initial, 'executing')).toBe(false)
  })

  it('labels the toggle with the resulting action and the row count', () => {
    const translate = (key: string, params: Record<string, string | number>) => `${key}:${String(params.name)}:${String(params.count)}`
    expect(bucketToggleLabel(translate as never, 'Running', true, 3)).toBe('bucket.expand:Running:3')
    expect(bucketToggleLabel(translate as never, 'Running', false, 3)).toBe('bucket.collapse:Running:3')
  })
})