/**
 * Locale completeness, key parity and message formatting.
 *
 * The two shipped dictionaries are the user-visible surface for both the board
 * and the Plugin Manager card, so parity is a hard requirement rather than a
 * nicety: a key present in one locale and missing from the other renders as a
 * raw dotted key in production.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createTranslate,
  DICTIONARIES,
  formatMessage,
  formatRelativeTime,
  LOCALE_NAMESPACE,
  lookup,
  missingLocalePaths,
  pickLocale,
} from '../src/shared/i18n.ts'
import type { LocaleFile } from '../src/shared/i18n.ts'

const HOUR = 3_600_000
const NOW = 1_700_000_000_000

/** Flatten a dictionary into sorted dotted key paths. */
function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value)
    .flatMap(([key, child]) => flatten(child, prefix === '' ? key : `${prefix}.${key}`))
    .sort()
}

/** Read one locale resource from disk, as a consumer installing the bundle would. */
function readLocaleFile(id: string): LocaleFile {
  const path = fileURLToPath(new URL(`../locale/${id}.json`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as LocaleFile
}

describe('locale resources', () => {
  it('ships both zh and en dictionaries with identical key sets', () => {
    expect(flatten(readLocaleFile('zh'))).toEqual(flatten(readLocaleFile('en')))
  })

  it('keeps the bundled dictionaries complete against the required paths', () => {
    // Not a tautology: `DICTIONARIES` is the validated runtime value, while the
    // files on disk are what a consumer installs. A resource that lost a
    // required key would be replaced by the fallback at runtime, and this is
    // what catches that before it ships.
    for (const id of ['zh', 'en'] as const) {
      expect(missingLocalePaths(readLocaleFile(id)), id).toEqual([])
      expect(DICTIONARIES[id]).toBeDefined()
    }
  })

  it('reports the paths an incomplete locale is missing', () => {
    expect(missingLocalePaths({})).toContain('meta.title')
    expect(missingLocalePaths({ meta: { title: 'x' } })).toContain('meta.description')
    expect(missingLocalePaths(null).length).toBeGreaterThan(0)
  })

  it('provides the display metadata the Plugin Manager reads without activating the plugin', () => {
    for (const id of ['zh', 'en']) {
      const file = readLocaleFile(id)
      expect(file.meta.title.length).toBeGreaterThan(0)
      expect(file.meta.description.length).toBeGreaterThan(0)
    }
  })

  it('has no empty strings', () => {
    for (const id of ['zh', 'en']) {
      const file = readLocaleFile(id)
      for (const key of flatten(file)) {
        expect(lookup(file, key), `${id}:${key}`).not.toBe('')
      }
    }
  })

  it('names the locale namespace', () => {
    expect(LOCALE_NAMESPACE).toBe('statusBoard')
  })
})

describe('pickLocale', () => {
  it('maps Chinese tags to zh and everything else to en', () => {
    expect(pickLocale('zh')).toBe('zh')
    expect(pickLocale('zh-CN')).toBe('zh')
    expect(pickLocale('ZH-Hant')).toBe('zh')
    expect(pickLocale('en-US')).toBe('en')
    expect(pickLocale('fr')).toBe('en')
    expect(pickLocale(undefined)).toBe('en')
  })
})

describe('formatMessage', () => {
  it('substitutes every named placeholder', () => {
    expect(formatMessage('{a} of {b}', { a: 1, b: 2 })).toBe('1 of 2')
  })

  it('repeats a placeholder used twice', () => {
    expect(formatMessage('{name} — {name}', { name: 'x' })).toBe('x — x')
  })

  it('leaves unknown placeholders visible instead of deleting copy', () => {
    expect(formatMessage('{known} {unknown}', { known: 'ok' })).toBe('ok {unknown}')
  })

  it('does not re-substitute text inserted by an earlier parameter', () => {
    // A per-parameter loop would turn `{a}` into `{b}`'s value here.
    expect(formatMessage('{a} {b}', { a: '{b}', b: 'SECOND' })).toBe('{b} SECOND')
  })

  it('returns the template untouched when no parameters are given', () => {
    expect(formatMessage('plain {text}')).toBe('plain {text}')
  })
})

describe('createTranslate', () => {
  it('renders Chinese copy for a zh locale', () => {
    expect(createTranslate('zh-CN')('bucket.decision')).toBe(DICTIONARIES.zh.bucket.decision)
  })

  it('renders English copy for an en locale', () => {
    expect(createTranslate('en-US')('bucket.decision')).toBe(DICTIONARIES.en.bucket.decision)
  })

  it('interpolates parameters', () => {
    expect(createTranslate('en')('bucket.recentHint', { hours: 24 })).toContain('24')
  })

  it('falls back to the key itself for an unknown path', () => {
    const translate = createTranslate('en')
    expect(translate('bucket.doesNotExist' as never)).toBe('bucket.doesNotExist')
  })
})

describe('formatRelativeTime', () => {
  const translate = createTranslate('en')

  it('reports unknown for a missing timestamp', () => {
    expect(formatRelativeTime(NOW, 0, translate)).toBe(DICTIONARIES.en.time.unknown)
  })

  it('reports just now under a minute', () => {
    expect(formatRelativeTime(NOW, NOW - 30_000, translate)).toBe(DICTIONARIES.en.time.justNow)
  })

  it('reports minutes, hours and days by magnitude', () => {
    expect(formatRelativeTime(NOW, NOW - 5 * 60_000, translate)).toBe('5 min ago')
    expect(formatRelativeTime(NOW, NOW - 3 * HOUR, translate)).toBe('3 h ago')
    expect(formatRelativeTime(NOW, NOW - 3 * 24 * HOUR, translate)).toBe('3 d ago')
  })

  it('treats a future timestamp as just now rather than inventing a date', () => {
    expect(formatRelativeTime(NOW, NOW + HOUR, translate)).toBe(DICTIONARIES.en.time.justNow)
  })
})