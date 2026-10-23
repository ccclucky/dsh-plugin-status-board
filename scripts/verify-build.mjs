/**
 * Post-build smoke check.
 *
 * `pnpm build` ends here so a packaging mistake fails loudly instead of at
 * install time in a user's profile. It validates the two artefacts the Harness
 * actually loads, without needing a running Harness:
 *
 * 1. the Host entry exports the plugin's activation contract,
 * 2. the Client entry is a syntactically valid classic script that registers
 *    exactly one loader factory under the package name.
 *
 * Run: `node scripts/verify-build.mjs`
 */
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Throw with a stable prefix so CI logs are greppable. */
function fail(message) {
  throw new Error(`verify-build: ${message}`)
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

// ── Host half ───────────────────────────────────────────────────────────────
const hostPath = join(root, 'lib', 'index.js')
const host = await import(pathToFileURL(hostPath).href)
if (typeof host.apply !== 'function') fail('lib/index.js must export apply(ctx, config)')
if (host.Config === undefined) fail('lib/index.js must export the Config schema')

// ── Client half ─────────────────────────────────────────────────────────────
const clientPath = join(root, 'lib', 'client.js')
const clientSource = await readFile(clientPath, 'utf8')

let registered
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        if (registered !== undefined) fail('client bundle called __ModuleLoader__.load twice')
        registered = entry
      },
    },
  },
}
try {
  runInNewContext(clientSource, sandbox, { timeout: 5_000 })
} catch (error) {
  fail(`client bundle threw while evaluating: ${String(error)}`)
}
if (registered === undefined) fail('client bundle never called window.__ModuleLoader__.load')
if (registered.id !== manifest.name) fail(`client loader id ${String(registered.id)} !== package name ${manifest.name}`)
if (typeof registered.factory !== 'function') fail('client loader entry has no factory function')

// The factory must resolve React through the table-provided `require`, and must
// tolerate being handed exactly that table (the browser's real contract).
const requested = []
const table = {
  require(specifier) {
    requested.push(specifier)
    if (specifier === 'react') {
      return {
        createElement: () => ({}),
        useSyncExternalStore: () => ({}),
      }
    }
    if (specifier === 'react/jsx-runtime') {
      return { jsx: () => ({}), jsxs: () => ({}), Fragment: 'fragment' }
    }
    if (specifier === 'react-dom') {
      return { createPortal: () => ({}) }
    }
    if (specifier === 'react-dom/client') {
      return { createRoot: () => ({ render: () => {}, unmount: () => {} }) }
    }
    throw new Error(`unexpected module: ${specifier}`)
  },
}
try {
  const exportsObject = registered.factory(table.require)
  if (typeof exportsObject !== 'object' || exportsObject === null) fail('client factory must return its exports object')
  if (typeof exportsObject.apply !== 'function') fail('client factory must export apply(ctx)')
} catch (error) {
  fail(`client factory threw: ${String(error)}`)
}
for (const specifier of requested) {
  if (!['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'].includes(specifier)) {
    fail(`client bundle required an unexpected module: ${specifier}`)
  }
}

// ── Declared files ──────────────────────────────────────────────────────────
for (const relative of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'cordis.patch.yml', 'icon.svg', 'locale/zh.json', 'locale/en.json']) {
  const size = (await stat(join(root, relative))).size
  if (size <= 0) fail(`${relative} is empty`)
}

const iconBytes = (await stat(join(root, 'icon.svg'))).size
if (iconBytes > 256 * 1024) fail(`icon.svg is ${iconBytes} bytes, above the 256 KiB limit`)

console.log(`verify-build: OK — ${manifest.name}@${manifest.version} (client ${clientSource.length} bytes, modules: ${[...new Set(requested)].join(', ')})`)