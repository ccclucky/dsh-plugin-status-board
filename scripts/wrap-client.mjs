/**
 * Wrap the compiled CommonJS Client bundle in the Harness module-loader
 * envelope.
 *
 * The Harness evaluates a Client bundle as a classic script and expects exactly
 * one top-level call:
 *
 *   window.__ModuleLoader__.load({
 *     id: '<package name>',
 *     factory: (require) => { ... return module.exports },
 *   })
 *
 * `require` resolves against the browser module table (`react`,
 * `react-dom`, `react/jsx-runtime`), which is why those stay external in
 * `tsdown.config.ts`. This script is the only build step that knows the
 * envelope; everything the factory contains is ordinary bundled code.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const input = join(root, 'lib', 'client.raw.cjs')
const output = join(root, 'lib', 'client.js')

/** The package name is the loader id; read it from the manifest, never from a literal. */
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = manifest.name

const source = await readFile(input, 'utf8')

// A CJS bundle may end with a sourceMappingURL comment; keep it, but make sure
// the envelope closes on its own line.
const body = source.trimEnd()

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    ${body.split('\n').join('\n    ')}
    return module.exports;
  },
});
`

await writeFile(output, wrapped, 'utf8')
await unlink(input)
console.log(`wrapped ${id} client bundle -> lib/client.js (${Buffer.byteLength(wrapped)} bytes)`)