/**
 * The completion-unread rules.
 *
 * The interesting cases are not "is the flag true" but the boundaries: a status
 * map that arrives from a shell without the field, ids the map does not know, and
 * a header count that must not exceed the rows actually listed.
 */
import { describe, expect, it } from 'vitest'
import {
  countCompletionUnread,
  isCompletionUnread,
  type SessionStatusLike,
  type SessionStatusMap,
} from '../src/client/completion-unread.ts'

function statuses(...entries: [string, SessionStatusLike][]): SessionStatusMap {
  return new Map(entries)
}

describe('isCompletionUnread', () => {
  it('is true only when the platform says so', () => {
    const map = statuses(['a', { completionUnread: true }], ['b', { completionUnread: false }])
    expect(isCompletionUnread(map, 'a')).toBe(true)
    expect(isCompletionUnread(map, 'b')).toBe(false)
  })

  it('treats a missing field as not unread', () => {
    // The shell may publish a status entry that only carries `running`; reading
    // truthiness off `undefined` would mark every such session unread.
    const map = statuses(['a', {}])
    expect(isCompletionUnread(map, 'a')).toBe(false)
  })

  it('treats an unknown session as not unread', () => {
    expect(isCompletionUnread(statuses(), 'missing')).toBe(false)
  })

  it('does not treat a non-boolean as unread', () => {
    const odd = statuses(['a', { completionUnread: 'yes' as unknown as boolean }])
    expect(isCompletionUnread(odd, 'a')).toBe(false)
  })
})

describe('countCompletionUnread', () => {
  const map = statuses(
    ['a', { completionUnread: true }],
    ['b', { completionUnread: true }],
    ['c', { completionUnread: false }],
    // present in the platform map but not on this board
    ['other', { completionUnread: true }],
  )

  it('counts only the entries it is given', () => {
    // Counting the whole map would report unread work the board does not list -
    // for example sessions filtered out by the search box.
    expect(countCompletionUnread(map, [{ id: 'a' }, { id: 'c' }])).toBe(1)
  })

  it('counts several unread entries', () => {
    expect(countCompletionUnread(map, [{ id: 'a' }, { id: 'b' }])).toBe(2)
  })

  it('returns zero for an empty list', () => {
    expect(countCompletionUnread(map, [])).toBe(0)
  })

  it('returns zero when the map is empty', () => {
    expect(countCompletionUnread(new Map(), [{ id: 'a' }, { id: 'b' }])).toBe(0)
  })

  it('never exceeds the number of entries', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(countCompletionUnread(map, entries)).toBeLessThanOrEqual(entries.length)
  })
})