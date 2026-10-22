/**
 * Ambient typing for JSON imports.
 *
 * The locale dictionaries are the single source of truth for user-facing copy
 * *and* for the Plugin Manager's `meta.title` / `meta.description`; the Client
 * bundle imports them so the two can never drift. `tsc` is told nothing about
 * their shape here so declaration emit never has to copy a file that lives
 * outside `rootDir`; `shared/i18n.ts` narrows the raw value once, with a
 * runtime-validated cast.
 */
declare module '*.json' {
  const value: unknown
  export default value
}