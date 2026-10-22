import { defineConfig } from 'vitest/config'

/**
 * The plugin's unit tests cover the pure logic (classification, ordering,
 * collapse state, config resolution, i18n keys) plus the manifest and locale
 * resources. No DOM is required, which keeps `pnpm test` fast and dependency
 * free.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // `.tsx` must be listed explicitly: `*.test.ts` does not match a `.tsx`
    // file, and a silently skipped view suite is exactly the kind of gap that
    // lets a blank panel ship.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
    },
  },
})