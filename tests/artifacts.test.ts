/**
 * Built-artifact contract.
 *
 * These checks assert the two shapes a consumer actually loads: the Host ESM
 * entry and the Client loader envelope. They require `lib/` to exist and FAIL
 * (not skip) when it does not — a silently skipped contract suite is how a
 * broken envelope reaches a user. `pnpm build` produces the artefacts, and CI
 * runs the build before the tests.
 *
 * Run `pnpm build` first if this suite reports missing artefacts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PANEL_CSS } from '../src/client/styles.ts'

const hostPath = new URL('../lib/index.js', import.meta.url)
const clientPath = new URL('../lib/client.js', import.meta.url)
const typesPath = new URL('../lib/types/index.d.ts', import.meta.url)

describe('built artifacts', () => {
  it('has been built', () => {
    for (const [name, path] of [
      ['lib/index.js', hostPath],
      ['lib/client.js', clientPath],
      ['lib/types/index.d.ts', typesPath],
    ] as const) {
      expect(existsSync(path), `${name} is missing — run pnpm build`).toBe(true)
    }
  })

  it('exports the Host activation contract from the real module', async () => {
    // `hostPath` is already a file URL; its `pathname` would double the drive
    // letter on Windows.
    const host = (await import(hostPath.href)) as Record<string, unknown>
    expect(typeof host.apply).toBe('function')
    expect(host.Config).toBeDefined()
    // The Host half must not export a default service class instead.
    expect(host.default).toBeUndefined()
  })

  it('keeps the Host entry free of browser globals', () => {
    const host = readFileSync(hostPath, 'utf8')
    expect(host).not.toContain('window.')
    expect(host).not.toContain('document.')
  })

  it('wraps the Client bundle in exactly one module-loader envelope', () => {
    const client = readFileSync(clientPath, 'utf8')
    expect(client.match(/window\.__ModuleLoader__\.load\(/g)).toHaveLength(1)
    expect(client.trimStart().startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(client.trimEnd().endsWith('});')).toBe(true)
  })

  it('registers the Client bundle under the package name', () => {
    const client = readFileSync(clientPath, 'utf8')
    expect(client).toContain('id: "dsh-plugin-status-board"')
    expect(client).toContain('factory: (require) => {')
    expect(client).toContain('return module.exports;')
  })

  it('loads the Client envelope and resolves React through the module table', () => {
    const client = readFileSync(clientPath, 'utf8')
    // Every external must come from the browser module table.
    const required = [...client.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
    expect(required.length).toBeGreaterThan(0)
    for (const specifier of required) {
      expect(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], specifier).toContain(specifier)
    }
    // The bundle must never import a Harness client package.
    expect(client).not.toContain('@deepseek-ai/dsh-client')
  })

  it('inlines both locale dictionaries rather than fetching them lazily', () => {
    const client = readFileSync(clientPath, 'utf8')
    expect(client).toContain('Session Status Board')
    expect(client).toContain('会话状态看板')
  })

  it('registers the panel through both slots under one id', () => {
    const client = readFileSync(clientPath, 'utf8')
    expect(client).toContain('sidebar.panellist')
    expect(client).toContain('main')
    expect(client).toContain('status-board')
  })

  it('ships the panel stylesheet byte-identical to the declared source', () => {
    // The envelope wrapper used to re-indent the bundle body, which silently
    // rewrote this string literal (it corrupted a CSS comment once). Compare the
    // whole literal against the source of truth rather than a sample selector,
    // so the check survives any redesign and still fails on a rewrite.
    const client = readFileSync(clientPath, 'utf8')
    expect(client).toContain(PANEL_CSS)
    // Colour must stay token-driven: no raw hex or rgba in the stylesheet.
    expect(PANEL_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(PANEL_CSS).not.toMatch(/rgba?\(/)
    expect(PANEL_CSS).toContain('var(--dsw-alias-')
  })
})