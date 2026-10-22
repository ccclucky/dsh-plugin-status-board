/**
 * The Client half's external store.
 *
 * These tests pin the behaviours the view relies on: deriving three boards from
 * a live session list, reporting the list phase, notifying subscribers only on
 * real change, persisting collapse choices, adopting the Host configuration
 * without clobbering a user click, and releasing every subscription on dispose.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  COLLAPSE_STORAGE_KEY,
  createBoardStore,
  loadPublishedConfig,
  parseCollapse,
  serializeCollapse,
  toStatusBoardConfig,
} from '../src/client/store.ts'
import type { BoardStoreOptions, CollapseStorage, LocaleFace } from '../src/client/store.ts'
import type { SessionListLike, SessionSummaryLike } from '../src/client/session-source.ts'
import type { ResolvedStatusBoardConfig } from '../src/shared/types.ts'

const NOW = 1_700_000_000_000

/** The documented defaults, spelled out so a default change fails loudly. */
function defaults(): ResolvedStatusBoardConfig {
  return { recentWindowHours: 24, maxRecent: 20, defaultCollapsed: 'recent', showEmptyBuckets: true }
}

/** A session list whose contents the test can publish later. */
function mutableSessions(initial: SessionSummaryLike[]) {
  const listeners = new Set<() => void>()
  let byId: Record<string, SessionSummaryLike> = Object.fromEntries(
    initial.filter(item => item.id !== undefined).map(item => [item.id as string, item]),
  )
  const service = {
    list: {
      getSnapshot: (): SessionListLike => ({ byId, phase: 'ready' as const }),
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  return {
    service,
    /** Replace the published rows and notify, exactly as the Harness does. */
    publish(next: SessionSummaryLike[]) {
      byId = Object.fromEntries(next.filter(item => item.id !== undefined).map(item => [item.id as string, item]))
      for (const listener of listeners) listener()
    },
    listeners,
  }
}

/** A locale service whose active locale the test can switch. */
function mutableLocale(initial = 'en'): LocaleFace & { setActive(id: string): void; listeners: Set<() => void> } {
  const listeners = new Set<() => void>()
  const state = { active: initial }
  return {
    listeners,
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setActive(id: string) {
      state.active = id
      for (const listener of listeners) listener()
    },
  }
}

/** An in-memory storage double. */
function memoryStorage(): CollapseStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

/** Build a store over the doubles, with a fixed clock and no config fetch. */
function build(overrides: Partial<BoardStoreOptions> = {}) {
  const sessions = overrides.sessions ?? mutableSessions([]).service
  const locale = overrides.locale ?? mutableLocale()
  const storage = overrides.storage ?? memoryStorage()
  const store = createBoardStore({
    sessions,
    locale,
    storage,
    now: () => NOW,
    loadConfig: () => Promise.resolve(undefined),
    ...overrides,
  })
  return { store, storage }
}

/** A top-level session row. */
function row(id: string, overrides: SessionSummaryLike = {}): SessionSummaryLike {
  return { id, displayTitle: id, running: false, updatedAt: NOW, ...overrides }
}

describe('createBoardStore', () => {
  it('reports an error state when the profile exposes no session list', () => {
    const store = createBoardStore({ sessions: {}, now: () => NOW, loadConfig: () => Promise.resolve(undefined) })
    expect(store.getSnapshot().status).toBe('error')
    expect(store.getSnapshot().board.counts).toEqual({ decision: 0, executing: 0, recent: 0 })
    store.dispose()
  })

  it('reports loading while the session list is still pending', () => {
    const store = createBoardStore({
      sessions: { list: { getSnapshot: () => ({ byId: {}, phase: 'pending' as const }), subscribe: () => () => {} } },
      now: () => NOW,
      loadConfig: () => Promise.resolve(undefined),
    })
    expect(store.getSnapshot().status).toBe('loading')
    store.dispose()
  })

  it('classifies the published sessions into the three boards', () => {
    const sessions = mutableSessions([
      row('e-run', { running: true }),
      row('r-idle'),
    ])
    const { store } = build({ sessions: sessions.service })
    expect(store.getSnapshot().board.counts).toEqual({ decision: 0, executing: 1, recent: 1 })
    store.dispose()
  })

  it('re-renders subscribers when the session list publishes', () => {
    const sessions = mutableSessions([row('r1')])
    const { store } = build({ sessions: sessions.service })
    const listener = vi.fn()
    store.subscribe(listener)

    sessions.publish([row('r1'), row('e1', { running: true })])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().board.counts.executing).toBe(1)
    store.dispose()
  })

  it('re-renders when only a row timestamp moved (relative time must not freeze)', () => {
    const sessions = mutableSessions([row('r1', { updatedAt: NOW - 60_000 })])
    const { store } = build({ sessions: sessions.service })
    const listener = vi.fn()
    store.subscribe(listener)

    sessions.publish([row('r1', { updatedAt: NOW - 10_000 })])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().board.buckets[2]?.entries[0]?.lastActivityAt).toBe(NOW - 10_000)
    store.dispose()
  })

  it('does not notify when a publication changes nothing visible', () => {
    const sessions = mutableSessions([row('r1')])
    const { store } = build({ sessions: sessions.service })
    const listener = vi.fn()
    store.subscribe(listener)

    sessions.publish([row('r1')])
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
  })

  it('starts with the configured default collapse mode', async () => {
    const { store } = build({ loadConfig: () => Promise.resolve({ ...defaults(), defaultCollapsed: 'all' }) })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().collapse).toEqual({ decision: true, executing: true, recent: true })
    store.dispose()
  })

  it('toggles one board and persists the whole state', () => {
    const storage = memoryStorage()
    const { store } = build({ storage })
    const initial = store.getSnapshot().collapse.recent
    store.toggle('recent')
    expect(store.getSnapshot().collapse.recent).toBe(!initial)
    const persisted = storage.data.get(COLLAPSE_STORAGE_KEY)
    expect(persisted).toBeDefined()
    expect(parseCollapse(persisted ?? null)?.recent).toBe(!initial)
    store.dispose()
  })

  it('restores a persisted collapse state on the next page load', () => {
    const storage = memoryStorage()
    storage.data.set(COLLAPSE_STORAGE_KEY, serializeCollapse({ decision: true, executing: false, recent: true }))
    const { store } = build({ storage })
    expect(store.getSnapshot().collapse).toEqual({ decision: true, executing: false, recent: true })
    store.dispose()
  })

  it('adopts the Host-published configuration without discarding a stored choice', async () => {
    const storage = memoryStorage()
    storage.data.set(COLLAPSE_STORAGE_KEY, serializeCollapse({ decision: false, executing: true, recent: false }))
    const { store } = build({
      storage,
      loadConfig: () => Promise.resolve({ ...defaults(), recentWindowHours: 6, maxRecent: 4, defaultCollapsed: 'all' }),
    })
    await Promise.resolve()
    await Promise.resolve()

    const state = store.getSnapshot()
    expect(state.config.recentWindowHours).toBe(6)
    expect(state.config.maxRecent).toBe(4)
    // The stored choice survives the late configuration publication.
    expect(state.collapse).toEqual({ decision: false, executing: true, recent: false })
    store.dispose()
  })

  it('does not revert a click made while the configuration was still loading', async () => {
    let release: ((value: ResolvedStatusBoardConfig) => void) | undefined
    const pending = new Promise<ResolvedStatusBoardConfig>(resolve => {
      release = resolve
    })
    const storage = memoryStorage()
    const { store } = build({ storage, loadConfig: () => pending })

    // The user clicks before the config arrives.
    store.toggle('decision')
    expect(store.getSnapshot().collapse.decision).toBe(true)

    release?.({ ...defaults(), defaultCollapsed: 'none' })
    await pending
    await Promise.resolve()

    // Their click must survive; only an untouched board adopts the default.
    expect(store.getSnapshot().collapse.decision).toBe(true)
    store.dispose()
  })

  it('applies the published default when the user has not chosen yet', async () => {
    const { store } = build({ loadConfig: () => Promise.resolve({ ...defaults(), defaultCollapsed: 'decision' }) })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().collapse.decision).toBe(true)
    store.dispose()
  })

  it('survives a failing configuration load', async () => {
    const { store } = build({ loadConfig: () => Promise.reject(new Error('offline')) })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().config.recentWindowHours).toBe(24)
    store.dispose()
  })

  it('re-renders when the locale changes', () => {
    const locale = mutableLocale('en')
    const { store } = build({ locale })
    const listener = vi.fn()
    store.subscribe(listener)
    locale.setActive('zh-CN')
    expect(listener).toHaveBeenCalled()
    expect(store.getSnapshot().locale).toBe('zh')
    store.dispose()
  })

  it('releases every subscription on dispose', () => {
    const sessions = mutableSessions([row('r1')])
    const locale = mutableLocale()
    const { store } = build({ sessions: sessions.service, locale })
    store.subscribe(() => {})
    store.dispose()
    expect(sessions.listeners.size).toBe(0)
    expect(locale.listeners.size).toBe(0)
    sessions.publish([row('r2', { running: true })])
    expect(store.getSnapshot().board.counts.executing).toBe(0)
  })

  it('is inert after dispose: no further subscriptions or toggles', () => {
    const storage = memoryStorage()
    const { store } = build({ storage })
    store.dispose()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    expect(typeof off).toBe('function')
    store.toggle('decision')
    expect(listener).not.toHaveBeenCalled()
    expect(storage.data.has(COLLAPSE_STORAGE_KEY)).toBe(false)
  })

  it('refreshes without throwing when the Host is unreachable', () => {
    const { store } = build({ loadConfig: () => Promise.reject(new Error('offline')) })
    expect(() => store.refresh()).not.toThrow()
    store.dispose()
  })
})

describe('parseCollapse', () => {
  it('round-trips a serialized state', () => {
    expect(parseCollapse(serializeCollapse({ decision: true, executing: false, recent: true }))).toEqual({
      decision: true,
      executing: false,
      recent: true,
    })
  })

  it('rejects corrupt JSON and partial shapes', () => {
    expect(parseCollapse('{')).toBeUndefined()
    expect(parseCollapse('null')).toBeUndefined()
    expect(parseCollapse('{"decision":true}')).toBeUndefined()
    expect(parseCollapse('{"decision":"yes","executing":false,"recent":true}')).toBeUndefined()
    expect(parseCollapse(null)).toBeUndefined()
  })
})

describe('toStatusBoardConfig', () => {
  it('keeps known fields and drops unknown ones', () => {
    expect(toStatusBoardConfig({ maxRecent: 5, nonsense: true })).toEqual({ maxRecent: 5 })
  })

  it('drops values of the wrong type', () => {
    expect(toStatusBoardConfig({ maxRecent: '5', showEmptyBuckets: 'yes' })).toEqual({})
  })

  it('returns undefined for a non-object payload', () => {
    expect(toStatusBoardConfig(null)).toBeUndefined()
    expect(toStatusBoardConfig('config')).toBeUndefined()
  })
})

describe('loadPublishedConfig', () => {
  it('returns the payload when the marker matches', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ marker: 'dsh-plugin-status-board', config: { maxRecent: 3 } }),
    })) as unknown as typeof fetch
    await expect(loadPublishedConfig(fetchImpl)).resolves.toMatchObject({ maxRecent: 3 })
  })

  it('rejects a foreign payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ marker: 'someone-else', config: { maxRecent: 3 } }),
    })) as unknown as typeof fetch
    await expect(loadPublishedConfig(fetchImpl)).resolves.toBeUndefined()
  })

  it('returns undefined on a non-ok response, a throw, or unparseable JSON', async () => {
    const notOk = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    await expect(loadPublishedConfig(notOk)).resolves.toBeUndefined()

    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(loadPublishedConfig(throwing)).resolves.toBeUndefined()

    const badJson = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('not json')
      },
    })) as unknown as typeof fetch
    await expect(loadPublishedConfig(badJson)).resolves.toBeUndefined()
  })

  it('returns undefined when the host has no fetch at all', async () => {
    await expect(loadPublishedConfig(undefined)).resolves.toBeUndefined()
  })

  it('clamps a configuration the Host should not have sent', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ marker: 'dsh-plugin-status-board', config: { recentWindowHours: 99_999 } }),
    })) as unknown as typeof fetch
    await expect(loadPublishedConfig(fetchImpl)).resolves.toMatchObject({ recentWindowHours: 720 })
  })
})