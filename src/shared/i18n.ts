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
  readonly panel: {
    readonly title: string
    /** Short form for the floating panel's bar, which has a count beside it. */
    readonly shortTitle: string
    readonly subtitle: string
  }
  readonly tree: {
    /** Accessible name of the inline folder tree. */
    readonly label: string
    /** Accessible name of one session row in the tree. */
    readonly session: string
      /** Announced for a row that finished running and has not been opened. */
      readonly unopened: string
  }
  readonly bucket: {
    readonly decision: string
    readonly executing: string
    readonly unread: string
    readonly recent: string
    readonly decisionHint: string
    readonly executingHint: string
    readonly unreadHint: string
    readonly recentHint: string
    /** Day-scale variant used when the configured window is a whole number of days. */
    readonly recentHintDays: string
    readonly empty: string
    readonly expand: string
    readonly collapse: string
    /** Noun phrase that turns a board's count into a readout, e.g. "waiting on you". */
    readonly decisionUnit: string
    readonly executingUnit: string
    readonly unreadUnit: string
    readonly recentUnit: string
    /** Per-board empty copy; more specific than the shared `empty`. */
    readonly decisionEmpty: string
    readonly executingEmpty: string
    readonly unreadEmpty: string
    readonly recentEmpty: string
      /** Suffix appended to a board's count: finished and not yet opened. */
      readonly unopened: string
  }
  readonly question: {
    readonly label: string
    readonly detail: string
    readonly custom: string
    readonly skipHint: string
    readonly submit: string
    readonly submitting: string
    readonly sent: string
    readonly openNotice: string
    readonly openSession: string
    readonly unavailable: string
    readonly error: string
  }
  readonly state: {
    readonly loading: string
    readonly empty: string
    readonly error: string
    readonly retry: string
    /** Shown when the filter matched nothing, distinct from "no sessions". */
    readonly noMatch: string
  }
  readonly summary: { readonly total: string; readonly truncated: string }
  readonly time: {
    readonly justNow: string
    readonly minutesAgo: string
    readonly hoursAgo: string
    readonly daysAgo: string
    readonly unknown: string
  }
  readonly action: {
    readonly open: string
    readonly refresh: string
    /** Placeholder and accessible label of the sidebar filter box. */
    readonly filter: string
    /** Accessible label of the floating board's close control. */
    readonly close: string
      /** Puts the floating entry back in its default corner. */
      readonly resetPosition: string
    /** Toggle that reveals a decision row's question card. */
    readonly answer: string
  }
  readonly detail: {
    /** Label of the hover-card section naming a session's board. */
    readonly label: string
  }
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
  | `tree.${keyof LocaleFile['tree']}`
  | `question.${keyof LocaleFile['question']}`
  | `detail.${keyof LocaleFile['detail']}`
  | `a11y.${keyof LocaleFile['a11y']}`
  | `panel.${keyof LocaleFile['panel']}`

/** Parameters substituted into `{name}` placeholders. */
export type MessageParams = Readonly<Record<string, string | number>>

/** Translate one dotted key for the active locale. */
export type Translate = (key: MessageKey, params?: MessageParams) => string

/**
 * Dotted paths every locale file must provide.
 *
 * Only the keys a *missing* one would visibly break are required: the Plugin
 * Manager's metadata, the three board names, and the empty/error copy. A
 * missing decorative key degrades to the English phrase through
 * {@link createTranslate}; a missing board name would render a raw dotted key in
 * the primary navigation, which is a defect worth reporting once.
 */
const REQUIRED_PATHS = [
  'meta.title',
  'meta.description',
  'panel.title',
  'panel.subtitle',
  'bucket.decision',
  'bucket.executing',
  'bucket.recent',
  'bucket.expand',
  'bucket.collapse',
  'state.empty',
  'state.error',
  'summary.total',
] as const

/** Report which required paths a raw locale file is missing. */
export function missingLocalePaths(value: unknown): string[] {
  return REQUIRED_PATHS.filter(path => typeof lookup(value as LocaleFile, path) !== 'string')
}

/**
 * Validate a locale resource and fall back when it is incomplete.
 *
 * The build ships these files, so an incomplete one means a packaging defect;
 * the panel still has to render, so the fallback dictionary wins and the defect
 * is reported once on the console instead of surfacing as raw dotted keys in the
 * sidebar.
 *
 * @param id - locale id, for the report.
 * @param raw - the imported JSON value.
 * @param fallback - already-validated dictionary to use when `raw` is
 *   incomplete.
 */
function loadDictionary(id: LocaleId, raw: unknown, fallback: LocaleFile | undefined): LocaleFile {
  const missing = missingLocalePaths(raw)
  if (missing.length === 0) return raw as LocaleFile
  console.error(
    `[dsh-plugin-status-board] locale/${id}.json is missing ${missing.join(', ')}` +
      (fallback === undefined ? '' : '; falling back to en'),
  )
  return fallback ?? (raw as LocaleFile)
}

// English is validated first and then acts as the fallback for every other
// locale, so a broken resource degrades to readable English rather than to raw
// dotted keys. Declaration order matters here: `zh` must not be evaluated
// before `en` exists.
const enDictionary = loadDictionary('en', enFile, undefined)
const zhDictionary = loadDictionary('zh', zhFile, enDictionary)

/** The two dictionaries, keyed by locale id. */
export const DICTIONARIES: Readonly<Record<LocaleId, LocaleFile>> = {
  zh: zhDictionary,
  en: enDictionary,
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
 * Substitute `{name}` placeholders in one pass.
 *
 * A single pass matters: substituting parameter by parameter would re-scan text
 * that a previous substitution just inserted, so a value containing `{b}` would
 * be rewritten by the later `b` replacement — a result that depended on object
 * key order. An unknown placeholder is left verbatim rather than replaced with
 * `''`, so a missing parameter shows up in review instead of silently deleting
 * copy.
 */
export function formatMessage(template: string, params?: MessageParams): string {
  if (params === undefined) return template
  return template.replace(/\{([^{}]+)\}/g, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match
    return String(params[name])
  })
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

/**
 * Describe the "recent records" window without making the user read 168 hours.
 * Whole days use the day form; smaller windows keep the hour form.
 */
export function recentWindowHint(hours: number, translate: Translate): string {
  if (hours >= 24 && hours % 24 === 0) return translate('bucket.recentHintDays', { days: hours / 24 })
  return translate('bucket.recentHint', { hours })
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