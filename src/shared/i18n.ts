/**
 * Bilingual copy: dictionary loading, key typing, interpolation and relative
 * time formatting.
 *
 * The dictionaries are the JSON files under `locale/`, which the Harness also
 * reads (without activating the plugin) for the Plugin Manager's
 * `meta.title` / `meta.description`. Importing the same files keeps the
 * shipped resources and the rendered UI in lockstep; `tests/i18n.test.ts`
 * fails if either locale loses a key the other one has.
 * @module dsh-plugin-status-board/shared/i18n
 */

import enFile from '../../locale/en.json'
import zhFile from '../../locale/zh.json'

/** Locale the Harness ships today; anything else falls back to English. */
export type LocaleId = 'zh' | 'en'

/** Shape of one locale file. */
export interface LocaleFile {
  readonly meta: { readonly title: string; readonly description: string }
  readonly panel: { readonly title: string; readonly subtitle: string }
  readonly bucket: {
    readonly decision: string
    readonly executing: string
    readonly recent: string
    readonly decisionHint: string
    readonly executingHint: string
    readonly recentHint: string
    readonly empty: string
    readonly expand: string
    readonly collapse: string
  }
  readonly state: {
    readonly loading: string
    readonly empty: string
    readonly error: string
    readonly retry: string
  }
  readonly summary: { readonly total: string; readonly truncated: string }
  readonly time: {
    readonly justNow: string
    readonly minutesAgo: string
    readonly hoursAgo: string
    readonly daysAgo: string
    readonly unknown: string
  }
  readonly action: { readonly open: string; readonly refresh: string }
  readonly a11y: {
    readonly panel: string
    readonly running: string
    readonly decision: string
    readonly idle: string
    readonly unknown: string
  }
}

/** Dotted key paths the UI may translate, e.g. `'bucket.decision'`. */
export type MessageKey =
  | `bucket.${keyof LocaleFile['bucket']}`
  | `state.${keyof LocaleFile['state']}`
  | `summary.${keyof LocaleFile['summary']}`
  | `time.${keyof LocaleFile['time']}`
  | `action.${keyof LocaleFile['action']}`
  | `a11y.${keyof LocaleFile['a11y']}`
  | `panel.${keyof LocaleFile['panel']}`

/** Parameters substituted into `{name}` placeholders. */
export type MessageParams = Readonly<Record<string, string | number>>

/** Translate one dotted key for the active locale. */
export type Translate = (key: MessageKey, params?: MessageParams) => string

/** The two dictionaries, keyed by locale id. */
export const DICTIONARIES: Readonly<Record<LocaleId, LocaleFile>> = {
  zh: zhFile as LocaleFile,
  en: enFile as LocaleFile,
}

/** The locale namespace registered with the Harness locale service. */
export const LOCALE_NAMESPACE = 'statusBoard'

/** Resolve a Harness locale id (`zh-CN`, `en-US`, …) to a dictionary id. */
export function pickLocale(active: string | undefined): LocaleId {
  return typeof active === 'string' && active.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Read one dotted key out of a dictionary.
 * @param dictionary - the locale file.
 * @param key - dotted path such as `bucket.decision`.
 * @returns the string, or `undefined` when the path does not exist.
 */
export function lookup(dictionary: LocaleFile, key: string): string | undefined {
  let cursor: unknown = dictionary
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return typeof cursor === 'string' ? cursor : undefined
}

/**
 * Substitute `{name}` placeholders.
 *
 * An unknown placeholder is left verbatim rather than replaced with `''`, so a
 * missing parameter shows up in review instead of silently deleting copy.
 */
export function formatMessage(template: string, params?: MessageParams): string {
  if (params === undefined) return template
  let text = template
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/**
 * Build a translator for one active locale.
 *
 * A key missing from the active dictionary falls back to English, then to the
 * key itself — the UI always renders something identifiable.
 */
export function createTranslate(active: string | undefined): Translate {
  const preferred = pickLocale(active)
  const primary = DICTIONARIES[preferred]
  const fallback = DICTIONARIES.en
  return (key, params) => {
    const text = lookup(primary, key) ?? lookup(fallback, key) ?? key
    return formatMessage(text, params)
  }
}

/** One hour in milliseconds (relative-time formatting). */
const HOUR_MS = 3_600_000

/**
 * Format a timestamp as a short relative phrase.
 *
 * Negative or non-finite input (clock skew, unknown timestamp) is reported as
 * "just now"/"unknown" rather than as a future date, because the board is a
 * "what needs me now" surface, not a log viewer.
 *
 * @param now - current epoch milliseconds.
 * @param then - the timestamp to describe.
 * @param translate - active translator.
 */
export function formatRelativeTime(now: number, then: number, translate: Translate): string {
  if (!Number.isFinite(then) || then <= 0) return translate('time.unknown')
  const elapsed = now - then
  if (elapsed < 60_000) return translate('time.justNow')
  if (elapsed < HOUR_MS) return translate('time.minutesAgo', { count: Math.floor(elapsed / 60_000) })
  if (elapsed < 24 * HOUR_MS) return translate('time.hoursAgo', { count: Math.floor(elapsed / HOUR_MS) })
  return translate('time.daysAgo', { count: Math.floor(elapsed / (24 * HOUR_MS)) })
}