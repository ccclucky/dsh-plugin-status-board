/**
 * Manifest and shipping-resource contract.
 *
 * A DSH bundle is only installable when the manifest, the patch, the locale
 * resources and the icon all agree. These checks run without a Harness: they
 * validate the package as a consumer would receive it.
 */
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Read and parse one repository file. */
function readJson<T = Record<string, unknown>>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')) as T
}

/** Read one repository file as text. */
function readText(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

interface Manifest {
  name: string
  version: string
  description: string
  license: string
  type: string
  main: string
  types: string
  icon: string
  exports: Record<string, unknown>
  files: string[]
  dsh: {
    manifestVersion: number
    bundle: { patch: string }
    client: { platform: string; immediately?: boolean; inject: string[] }
  }
  scripts: Record<string, string>
  peerDependencies: Record<string, string>
}

const manifest = readJson<Manifest>('package.json')

describe('package manifest', () => {
  it('is named dsh-plugin-status-board', () => {
    expect(manifest.name).toBe('dsh-plugin-status-board')
  })

  it('is an MIT-licensed ESM package', () => {
    expect(manifest.license).toBe('MIT')
    expect(manifest.type).toBe('module')
  })

  it('declares the bundle patch the Loader merges', () => {
    expect(manifest.dsh.manifestVersion).toBe(1)
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
  })

  it('declares a web Client half with the module ordering it needs', () => {
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-locale')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-slots')
  })

  it('exports the runtime entries the manifest points at', () => {
    expect(manifest.exports['.']).toEqual({ types: './lib/types/index.d.ts', default: './lib/index.js' })
    expect(manifest.exports['./client']).toEqual({ types: './lib/types/client/index.d.ts', default: './lib/client.js' })
    expect(manifest.exports['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.exports['./icon']).toBe('./icon.svg')
  })

  it('ships every file the runtime needs', () => {
    for (const required of ['lib/index.js', 'lib/client.js', 'locale/*.json', 'icon.svg', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
      expect(manifest.files, required).toContain(required)
    }
  })

  it('declares the type declarations it exports', () => {
    expect(manifest.types).toBe('lib/types/index.d.ts')
    expect(manifest.files).toContain('lib/types/**/*.d.ts')
  })

  it('provides the documented scripts', () => {
    for (const script of ['build', 'test', 'typecheck', 'clean']) {
      expect(manifest.scripts[script], script).toBeTruthy()
    }
  })

  it('keeps React as a peer dependency, never a bundled copy', () => {
    expect(manifest.peerDependencies.react).toBeDefined()
  })
})

describe('bundle patch', () => {
  const patch = readText('cordis.patch.yml')
  /** The patch body without its explanatory comment block. */
  const directives = patch
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.trimStart().startsWith('#'))
    .join('\n')

  it('inserts exactly one row named after the package', () => {
    expect(directives).toContain('- insert:')
    expect(directives).toContain("name: 'dsh-plugin-status-board'")
    // Two `insert` directives would mount the plugin twice in one profile.
    expect(directives.match(/- insert:/g)).toHaveLength(1)
  })

  it('uses a stable row id', () => {
    expect(directives).toContain('id: status-board')
  })

  it('ships the documented default configuration', () => {
    for (const knob of ['recentWindowHours', 'maxRecent', 'defaultCollapsed', 'showEmptyBuckets']) {
      expect(directives, knob).toContain(knob)
    }
  })
})

describe('shipping resources', () => {
  it('ships both locale files with display metadata', () => {
    for (const id of ['zh', 'en']) {
      const locale = readJson<{ meta: { title: string; description: string } }>(`locale/${id}.json`)
      expect(locale.meta.title.length, id).toBeGreaterThan(0)
      expect(locale.meta.description.length, id).toBeGreaterThan(0)
    }
  })

  it('ships an SVG icon within the 256 KiB limit', () => {
    const stat = statSync(new URL('../icon.svg', import.meta.url))
    expect(stat.size).toBeGreaterThan(0)
    expect(stat.size).toBeLessThan(256 * 1024)
    const icon = readText('icon.svg')
    expect(icon.trimStart().startsWith('<svg')).toBe(true)
    expect(icon).toContain('viewBox')
  })

  it('names the icon in the manifest and the exports map', () => {
    expect(manifest.icon).toBe('./icon.svg')
  })
})

describe('LICENSE', () => {
  const license = readText('LICENSE')

  it('is the standard MIT text', () => {
    expect(license).toContain('MIT License')
    expect(license).toContain('Permission is hereby granted, free of charge')
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  })

  it('names a copyright holder', () => {
    expect(license).toMatch(/Copyright \(c\) \d{4}/)
  })
})

describe('repository hygiene', () => {
  const ignore = readText('.gitignore')

  it('ignores build output and dependencies', () => {
    for (const entry of ['node_modules/', 'lib/', 'coverage/']) {
      expect(ignore, entry).toContain(entry)
    }
  })

  it('resolves the repository root next to package.json', () => {
    expect(root.endsWith('dsh-plugin-status-board\\') || root.endsWith('dsh-plugin-status-board/')).toBe(true)
  })
})