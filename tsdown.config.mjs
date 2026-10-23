/**
 * tsdown build for dsh-plugin-status-board.
 *
 * Two independent artefacts are produced:
 *
 * 1. `lib/index.js` — the Host half as plain ESM (`export function apply`),
 *    loaded by the Cordis Loader on the Node side.
 * 2. `lib/client.raw.cjs` — the Client half as a CommonJS bundle whose only
 *    external is the browser module table (`react` / `react-dom` /
 *    `react/jsx-runtime`). `scripts/wrap-client.mjs` wraps that bundle into
 *    the `window.__ModuleLoader__.load({ id, factory(require) })` envelope the
 *    Harness Web runtime expects and writes `lib/client.js`.
 *
 * Keeping the two halves separate is required by the manifest: the Loader
 * imports `lib/index.js` with `import()`, while the browser evaluates
 * `lib/client.js` as a classic script.
 *
 * WHY THIS FILE IS `.mjs` AND NOT `.ts`
 * ─────────────────────────────────────
 * tsdown chooses how to load its config from `process.features.typescript`:
 * on a Node that can strip types it uses the native loader, otherwise it falls
 * back to the `unrun` package — which is only an OPTIONAL peer of tsdown, so it
 * is not installed. A `.ts` config therefore builds on a modern Node and dies
 * on the oldest Node this package claims to support (`engines.node: >=20`) with
 * `Failed to import module "unrun"`, which is exactly what CI showed while a
 * developer machine stayed green. A plain ESM config is never type-stripped, so
 * the build no longer depends on the runner's Node major at all. The
 * `UserConfig[]` JSDoc keeps the editor typing that the `.ts` version had.
 *
 * @type {import('tsdown').UserConfig[]}
 */
const clientExternals = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']

const config = [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    dts: false,
    clean: false,
    sourcemap: false,
    // The manifest exports `./lib/index.js`; pin the extension so a future
    // tsdown default cannot silently rename the Host entry.
    outExtensions: () => ({ js: '.js' }),
    // Harness Host packages and the vendored cordis are provided by the
    // running deployment, never bundled into a published plugin.
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    entry: { 'client.raw': 'src/client/index.tsx' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2020',
    dts: false,
    clean: false,
    sourcemap: false,
    // The build ends with `scripts/wrap-client.mjs`, which consumes
    // `client.raw.cjs` and emits the loader-enveloped `lib/client.js`.
    outExtensions: () => ({ js: '.cjs' }),
    // The browser module table supplies React; the wrapper passes it in
    // through the factory's `require`.
    deps: { neverBundle: clientExternals },
    outputOptions: {
      exports: 'named',
      // One classic script, one factory: no dynamic chunk imports, so the
      // loader envelope stays a single evaluated file.
      inlineDynamicImports: true,
    },
  },
]

export default config
