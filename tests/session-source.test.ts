/**
 * The runtime adapter: snapshot → SessionSignal.
 *
 * Every field this adapter reads was verified against the installed Harness
 * (`@deepseek-ai/dsh-api-session-controller`, `SessionListState` /
 * `SessionSummary` / `SessionProjectionSnapshot`), so these tests double as the
 * contract for "what makes a session await a decision".
 */
import { describe, expect, it } from 'vitest'
import {
  collectSessionSignals,
  isAwaitingDecision,
  isSubagentChild,
  questionsOf,
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
  phase: 'pending' | 'ready' = 'ready',
): SessionListLike {
  const byId: Record<string, SessionSummaryLike> = {}
  for (const item of summaries) {
    if (item.id !== undefined) byId[item.id] = item
  }
  return { byId, phase, projectionsBySession: projections }
}

describe('isAwaitingDecision', () => {
  it('is true while a user question is parked on the session', () => {
    const projection: ProjectionLike = { values: { userQuestions: { active: [{ id: 'q1' }] } } }
    expect(isAwaitingDecision(projection)).toBe(true)
  })

  it('is false when the question list is empty or absent', () => {
    expect(isAwaitingDecision({ values: { userQuestions: { active: [] } } })).toBe(false)
    expect(isAwaitingDecision({ values: { userQuestions: {} } })).toBe(false)
    expect(isAwaitingDecision({ values: {} })).toBe(false)
    expect(isAwaitingDecision(undefined)).toBe(false)
  })

  it('ignores team tasks: a finished ticket keeps its pending rows forever', () => {
    // Real team boards record tasks as `pending` with no consumer-facing
    // "waiting on the user" marker (measured on disk: `ready` is absent from the
    // wire, so a rule keyed on it is dead). Treating them as decisions pinned a
    // six-day-old completed session to the decision board, which is exactly the
    // defect this test locks out.
    const withPendingTasks = { values: { agentTeam: { tasks: [{ status: 'pending', ready: true }] } } }
    expect(isAwaitingDecision(withPendingTasks as never)).toBe(false)
  })

  it('survives a projection whose values have the wrong shape', () => {
    expect(isAwaitingDecision({ values: { userQuestions: 'x' as never } })).toBe(false)
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
          updatedAt: 1_700_000_000_000,
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
      list([summary({ id: 'root' }), summary({ id: 'child', origin: 'subagent', parentId: 'root' })]),
    )
    expect(signals.map(s => s.id)).toEqual(['root'])
  })

  it('skips blank sessions that never exchanged a message', () => {
    const signals = collectSessionSignals(
      list([summary({ id: 'real' }), summary({ id: 'draft', blank: true })]),
    )
    expect(signals.map(s => s.id)).toEqual(['real'])
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
      list([summary({ id: 'a' })], { a: { values: { userQuestions: { active: [{ id: 'q' }] } } } }),
    )
    expect(signals[0]?.awaitingDecision).toBe(true)
  })
})

describe('questionsOf', () => {
  it('reduces the userQuestions projection into renderable calls', () => {
    const projection = {
      values: {
        userQuestions: {
          active: [
            {
              callId: 'call-1',
              state: 'continued',
              questions: [
                {
                  id: 'q1',
                  header: 'Plan review',
                  question: 'Proceed with the plan?',
                  detail: 'The full plan text.',
                  options: [
                    { label: 'Approve', description: 'Ship it' },
                    { label: 'Request changes' },
                  ],
                  multiSelect: false,
                },
              ],
            },
          ],
        },
      },
    }
    expect(questionsOf(projection)).toEqual([
      {
        callId: 'call-1',
        state: 'continued',
        questions: [
          {
            id: 'q1',
            header: 'Plan review',
            question: 'Proceed with the plan?',
            detail: 'The full plan text.',
            options: [{ label: 'Approve', description: 'Ship it' }, { label: 'Request changes' }],
            multiSelect: false,
          },
        ],
      },
    ])
  })

  it('accepts a real persisted ask_user_question batch', () => {
    // Copied from a real session log: the tool arguments and option labels are
    // verbatim, so this locks the adapter to the payload the Host actually
    // writes rather than to a synthetic shape.
    const projection = {
      values: {
        userQuestions: {
          active: [
            {
              callId: 'call_00_4GvK4kHkD8aFkEMUqs3X5286',
              state: 'continued',
              questions: [
                {
                  id: 'restart',
                  header: '重启生效',
                  question: '0.2.2 已装到 profile，但运行中的宿主仍加载 0.1.0，需重启桌面端才生效。怎么处理？',
                  options: [
                    {
                      label: '我自己重启（推荐）',
                      description: '你手动退出并重开 DeepSeek Harness，本次会话不中断，重启后生效。',
                    },
                    {
                      label: '由我自动重启',
                      description: '我用脚本退出并重开 App，本会话连接会短暂断开，重连后继续。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }
    const calls = questionsOf(projection)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.callId).toBe('call_00_4GvK4kHkD8aFkEMUqs3X5286')
    expect(calls[0]?.questions[0]?.options?.[0]?.label).toBe('我自己重启（推荐）')
  })

  it('drops malformed calls instead of failing the whole board', () => {
    expect(questionsOf(undefined)).toEqual([])
    expect(questionsOf({ values: { userQuestions: { active: 'nope' as never } } })).toEqual([])
    expect(
      questionsOf({
        values: {
          userQuestions: {
            active: [
              { callId: 'missing-state', questions: [{ id: 'q', question: 'x' }] },
              { callId: 'bad-question', state: 'open', questions: [{ id: '', question: 'x' }] },
              { callId: 'ok', state: 'open', questions: [{ id: 'q', question: 'x', options: [{ label: '' }] }] },
            ],
          },
        },
      }),
    ).toEqual([{ callId: 'ok', state: 'open', questions: [{ id: 'q', question: 'x' }] }])
  })

  it('prefers the row projection and falls back to the resident projection map', () => {
    const viaRow = collectSessionSignals({
      byId: {
        a: {
          id: 'a',
          displayTitle: 'A',
          projectionValues: {
            userQuestions: {
              active: [{ callId: 'c', state: 'continued', questions: [{ id: 'q', question: 'Row?' }] }],
            },
          },
        },
      },
      phase: 'ready',
    })
    expect(viaRow[0]?.questions?.[0]?.callId).toBe('c')

    const viaResident = collectSessionSignals({
      byId: { b: { id: 'b', displayTitle: 'B' } },
      phase: 'ready',
      projectionsBySession: {
        b: {
          values: {
            userQuestions: {
              active: [{ callId: 'd', state: 'open', questions: [{ id: 'q', question: 'Resident?' }] }],
            },
          },
        },
      },
    })
    expect(viaResident[0]?.questions?.[0]?.callId).toBe('d')
  })
})
