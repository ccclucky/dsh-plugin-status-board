/**
 * Built-artifact contract.
 *
 * These checks only run after `pnpm build`, and they validate the two shapes a
 * consumer actually loads: the Host ESM entry and the Client loader envelope.
 * A regression here is invisible to typechecking (the wrapper is generated
 * text), which is exactly why it is tested.
 */
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hostPath = new URL('../lib/index.js', import.meta.url)
const clientPath = new URL('../lib/client.js', import.meta.url)
const typesPath = new URL('../lib/types/index.d.ts', import.meta.url)

const built = existsSync(hostPath) && existsSync(clientPath)

describe.skipIf(!built)('built artifacts', () => {
  const host = readFileSync(hostPath, 'utf8')
  const client = readFileSync(clientPath, 'utf8')

  it('ships a Host entry exporting apply and Config', () => {
    expect(host).toContain('export')
    expect(host).toMatch(/function apply\(/)
    expect(host).toContain('Config')
  })

  it('ships type declarations for the Host entry', () => {
    expect(existsSync(typesPath)).toBe(true)
  })

  it('wraps the Client bundle in exactly one module-loader envelope', () => {
    expect(client.match(/window\.__ModuleLoader__\.load\(/g)).toHaveLength(1)
    expect(client.trimStart().startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(client.trimEnd().endsWith('});')).toBe(true)
  })

  it('registers the Client bundle under the package name', () => {
    expect(client).toContain('id: "dsh-plugin-status-board"')
  })

  it('exposes a factory that returns the module exports', () => {
    expect(client).toContain('factory: (require) => {')
    expect(client).toContain('return module.exports;')
  })

  it('keeps React external so the browser module table owns it', () => {
    expect(client).toContain('require("react")')
    expect(client).not.toMatch(/from\s*["']react["']/)
  })

  it('resolves every external through the factory-provided require', () => {
    const required = [...client.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
    expect(required.length).toBeGreaterThan(0)
    for (const specifier of required) {
      expect(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], specifier).toContain(specifier)
    }
  })

  it('inlines both locale dictionaries rather than fetching them lazily', () => {
    expect(client).toContain('Session Status Board')
    expect(client).toContain('会话状态看板')
  })

  it('registers the three boards through the sidebar panellist and main slots', () => {
    expect(client).toContain('sidebar.panellist')
    expect(client).toContain('status-board')
  })
})