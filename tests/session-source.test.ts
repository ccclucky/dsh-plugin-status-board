/**
 * The runtime adapter: snapshot → SessionSignal.
 *
 * The adapter is the only place that knows the Harness snapshot shape, so its
 * tests double as the documentation of what "awaiting a decision" means for
 * each signal a release may publish.
 */
import { describe, expect, it } from 'vitest'
import {
  collectSessionSignals,
  hasReadyPendingTeamTask,
  isAwaitingDecision,
  isSubagentChild,
} from '../src/client/session-source.ts'
import type { ProjectionLike, SessionListLike, SessionSummaryLike } from '../src/client/session-source.ts'

/** One summary with the fields a test cares about. */
function summary(overrides: SessionSummaryLike & { id: string }): SessionSummaryLike {
  return { displayTitle: overrides.id, running: false, ...overrides }
}

/** A session list built from plain summaries. */
function list(
  summaries: readonly SessionSummaryLike[],
  projections?: Record<string, ProjectionLike>,
): SessionListLike {
  const byId: Record<string, SessionSummaryLike> = {}
  for (const item of summaries) {
    if (item.id !== undefined) byId[item.id] = item
  }
  return { byId, projectionsBySession: projections }
}

describe('isAwaitingDecision', () => {
  it('honours the explicit flag', () => {
    expect(isAwaitingDecision(summary({ id: 'a', awaitingDecision: true }), undefined)).toBe(true)
  })

  it('recognises each status word a release may publish', () => {
    for (const status of ['awaiting', 'awaiting-decision', 'awaiting_decision', 'pending-decision', 'needs-decision', 'approval']) {
      expect(isAwaitingDecision(summary({ id: 'a', status }), undefined), status).toBe(true)
    }
  })

  it('does not treat an ordinary status as a decision', () => {
    for (const status of ['idle', 'running', 'completed', 'archived']) {
      expect(isAwaitingDecision(summary({ id: 'a', status }), undefined), status).toBe(false)
    }
  })

  it('recognises a pending interaction marker', () => {
    expect(isAwaitingDecision(summary({ id: 'a', interaction: 'pending' }), undefined)).toBe(true)
    expect(isAwaitingDecision(summary({ id: 'a', interaction: 'awaiting' }), undefined)).toBe(true)
    expect(isAwaitingDecision(summary({ id: 'a', interaction: 'none' }), undefined)).toBe(false)
  })

  it('recognises a ready pending team task in the session projection', () => {
    const projection: ProjectionLike = {
      values: { agentTeam: { tasks: [{ status: 'pending', ready: true }] } },
    }
    expect(isAwaitingDecision(summary({ id: 'a' }), projection)).toBe(true)
  })

  it('ignores a blocked or already claimed team task', () => {
    const blocked: ProjectionLike = {
      values: { agentTeam: { tasks: [{ status: 'pending', ready: false }] } },
    }
    const claimed: ProjectionLike = {
      values: { agentTeam: { tasks: [{ status: 'in_progress', ready: true }] } },
    }
    expect(isAwaitingDecision(summary({ id: 'a' }), blocked)).toBe(false)
    expect(isAwaitingDecision(summary({ id: 'a' }), claimed)).toBe(false)
  })

  it('defaults to false for an empty summary', () => {
    expect(isAwaitingDecision({ id: 'a' }, undefined)).toBe(false)
  })
})

describe('hasReadyPendingTeamTask', () => {
  it('is false when the projection carries no team board', () => {
    expect(hasReadyPendingTeamTask(undefined)).toBe(false)
    expect(hasReadyPendingTeamTask({})).toBe(false)
    expect(hasReadyPendingTeamTask({ values: {} })).toBe(false)
  })

  it('is false when tasks is not an array', () => {
    expect(hasReadyPendingTeamTask({ values: { agentTeam: { tasks: 'x' as never } } })).toBe(false)
  })
})

describe('isSubagentChild', () => {
  it('detects the durable origin marker', () => {
    expect(isSubagentChild({ id: 'a', origin: 'subagent' })).toBe(true)
  })

  it('detects a durable parent address', () => {
    expect(isSubagentChild({ id: 'a', parentId: 'root' })).toBe(true)
  })

  it('treats a top-level session as visible', () => {
    expect(isSubagentChild({ id: 'a' })).toBe(false)
    expect(isSubagentChild({ id: 'a', parentId: '' })).toBe(false)
  })
})

describe('collectSessionSignals', () => {
  it('returns nothing before the first publication', () => {
    expect(collectSessionSignals(undefined)).toEqual([])
    expect(collectSessionSignals({})).toEqual([])
  })

  it('reduces a summary into the classifier shape', () => {
    const signals = collectSessionSignals(
      list([
        summary({
          id: 's1',
          displayTitle: '  Fix the parser  ',
          cwd: 'D:/work/app',
          running: true,
          lastActivityAt: 1_700_000_000_000,
        }),
      ]),
    )
    expect(signals).toEqual([
      {
        id: 's1',
        title: 'Fix the parser',
        workspacePath: 'D:/work/app',
        running: true,
        awaitingDecision: false,
        lastActivityAt: 1_700_000_000_000,
      },
    ])
  })

  it('prefers the display title and falls back to the id', () => {
    const signals = collectSessionSignals(
      list([
        summary({ id: 'a', displayTitle: 'Title A', title: 'Legacy A' }),
        summary({ id: 'b', displayTitle: '   ', title: 'Legacy B' }),
        { id: 'c' },
      ]),
    )
    expect(signals.map(s => s.title)).toEqual(['Title A', 'Legacy B', 'c'])
  })

  it('prefers lastActivityAt and falls back to updatedAt', () => {
    const signals = collectSessionSignals(
      list([
        summary({ id: 'a', lastActivityAt: 5, updatedAt: 9 }),
        summary({ id: 'b', updatedAt: 9 }),
        summary({ id: 'c' }),
      ]),
    )
    expect(signals.map(s => s.lastActivityAt)).toEqual([5, 9, 0])
  })

  it('skips subagent children so the board lists conversations', () => {
    const signals = collectSessionSignals(
      list([
        summary({ id: 'root' }),
        summary({ id: 'child', origin: 'subagent', parentId: 'root' }),
      ]),
    )
    expect(signals.map(s => s.id)).toEqual(['root'])
  })

  it('skips malformed rows instead of throwing', () => {
    const signals = collectSessionSignals({
      byId: {
        ok: summary({ id: 'ok' }),
        missingId: { displayTitle: 'no id' },
        blankId: { id: '' },
        notAnObject: null as never,
      },
    })
    expect(signals.map(s => s.id)).toEqual(['ok'])
  })

  it('does not leak an absent workspace into the signal', () => {
    const signals = collectSessionSignals(list([summary({ id: 'a', cwd: '' })]))
    expect(signals[0]?.workspacePath).toBeUndefined()
  })

  it('reads the decision signal from the session projection', () => {
    const signals = collectSessionSignals(
      list([summary({ id: 'a' })], {
        a: { values: { agentTeam: { tasks: [{ status: 'pending', ready: true }] } } },
      }),
    )
    expect(signals[0]?.awaitingDecision).toBe(true)
  })
})