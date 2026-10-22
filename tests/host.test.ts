/**
 * Host half: the config route and the Loader schema.
 *
 * The route is the Host half's whole public surface, so its contract is pinned
 * here: method handling, payload marker, and the resolved values a Client
 * should receive.
 */
import { describe, expect, it } from 'vitest'
import { apply, Config, createConfigHandler } from '../src/index.ts'
import { CONFIG_DEFAULTS, resolveConfig } from '../src/shared/config.ts'
import { STATUS_BOARD_CONFIG_MARKER, STATUS_BOARD_CONFIG_PATH } from '../src/shared/route.ts'
import type { RouteRequest, RouteResponse, WebRoute } from '../src/index.ts'

/** A response recorder standing in for the web server's response object. */
function recorder(): { response: RouteResponse; status(): number; headers(): Record<string, string>; body(): unknown } {
  let status = 0
  let headers: Record<string, string> = {}
  let body = ''
  const response: RouteResponse = {
    statusCode: 0,
    writeHead(code, nextHeaders) {
      status = code
      headers = nextHeaders ?? {}
    },
    end(payload) {
      body = payload ?? ''
    },
  }
  return {
    response,
    status: () => status,
    headers: () => headers,
    body: () => JSON.parse(body === '' ? 'null' : body) as unknown,
  }
}

/** Call the handler with one request. */
function call(handler: ReturnType<typeof createConfigHandler>, request: RouteRequest) {
  const sink = recorder()
  handler(request, sink.response)
  return sink
}

describe('createConfigHandler', () => {
  const config = resolveConfig({ recentWindowHours: 48, maxRecent: 7, defaultCollapsed: 'all', showEmptyBuckets: false })

  it('answers GET with the resolved configuration and a marker', () => {
    const sink = call(createConfigHandler(config), { method: 'GET' })
    expect(sink.status()).toBe(200)
    expect(sink.body()).toEqual({ marker: STATUS_BOARD_CONFIG_MARKER, config })
  })

  it('serves JSON that a browser must not cache', () => {
    const sink = call(createConfigHandler(config), { method: 'GET' })
    expect(sink.headers()['content-type']).toContain('application/json')
    expect(sink.headers()['cache-control']).toBe('no-store')
  })

  it('treats a missing method as GET', () => {
    const sink = call(createConfigHandler(config), {})
    expect(sink.status()).toBe(200)
  })

  it('refuses every other method without leaking the payload', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const sink = call(createConfigHandler(config), { method })
      expect(sink.status(), method).toBe(405)
      expect(sink.body()).toEqual({ marker: STATUS_BOARD_CONFIG_MARKER, error: 'method-not-allowed' })
    }
  })

  it('publishes defaults when the row carries no config', () => {
    const sink = call(createConfigHandler(resolveConfig(undefined)), { method: 'GET' })
    expect((sink.body() as { config: unknown }).config).toEqual(CONFIG_DEFAULTS)
  })
})

describe('Config schema', () => {
  it('is an object schema exposing the four documented fields', () => {
    const shape = (Config as unknown as { dict: Record<string, unknown> }).dict
    expect(Object.keys(shape).sort()).toEqual(['defaultCollapsed', 'maxRecent', 'recentWindowHours', 'showEmptyBuckets'])
  })

  it('accepts an empty object so a bare row activates', () => {
    expect(Config({})).toBeTruthy()
  })

  it('rejects a window outside the documented bounds', () => {
    expect(() => Config({ recentWindowHours: 0 })).toThrow()
    expect(() => Config({ recentWindowHours: 100_000 })).toThrow()
  })

  it('rejects an unknown collapse mode', () => {
    expect(() => Config({ defaultCollapsed: 'everything' as never })).toThrow()
  })
})

describe('apply', () => {
  /**
   * A context recording the effects it is asked to own.
   *
   * `effect` mirrors cordis: the callback runs once at registration and the
   * disposer it returns is what unload calls. Re-running the callback on unload
   * (an earlier, wrong model) would register a second route and hide the very
   * leak this suite is meant to catch.
   */
  function fakeContext(options: { withWebServer: boolean }) {
    const routes: WebRoute[] = []
    const disposers: Array<() => unknown> = []
    const logs: string[] = []
    const ctx = {
      get(name: string) {
        if (name === 'webServer' && options.withWebServer) {
          return {
            register(route: WebRoute) {
              routes.push(route)
              return () => {
                const index = routes.indexOf(route)
                if (index >= 0) routes.splice(index, 1)
              }
            },
          }
        }
        return undefined
      },
      effect(callback: () => unknown) {
        const disposer = callback()
        disposers.push(typeof disposer === 'function' ? (disposer as () => unknown) : () => {})
        return disposer
      },
      logger: { debug: (message: string) => logs.push(message) },
    }
    return { ctx, routes, disposers, logs }
  }

  it('registers exactly one exact-path config route', () => {
    const { ctx, routes } = fakeContext({ withWebServer: true })
    apply(ctx, undefined)
    expect(routes).toHaveLength(1)
    expect(routes[0]?.path).toBe(STATUS_BOARD_CONFIG_PATH)
    expect(routes[0]?.kind).toBe('exact')
  })

  it('serves the row config through the registered route', () => {
    const { ctx, routes } = fakeContext({ withWebServer: true })
    apply(ctx, { recentWindowHours: 6, maxRecent: 3 })
    const route = routes[0]
    expect(route).toBeDefined()
    const sink = recorder()
    route?.handler({ method: 'GET' }, sink.response)
    expect((sink.body() as { config: { recentWindowHours: number } }).config.recentWindowHours).toBe(6)
  })

  it('still activates without a web server, registering no route', () => {
    const { ctx, routes, logs } = fakeContext({ withWebServer: false })
    expect(() => apply(ctx, undefined)).not.toThrow()
    expect(routes).toHaveLength(0)
    // Activation is still observable in the log: a headless composition is a
    // supported deployment, not a silent failure.
    expect(logs).toHaveLength(1)
  })

  it('logs the resolved configuration at activation', () => {
    const { ctx, logs } = fakeContext({ withWebServer: true })
    apply(ctx, { recentWindowHours: 12, maxRecent: 9 })
    expect(logs.join('\n')).toContain('window=12h')
    expect(logs.join('\n')).toContain('cap=9')
  })

  it('owns the route through an effect so unloading removes it', () => {
    const { ctx, routes, disposers } = fakeContext({ withWebServer: true })
    apply(ctx, undefined)
    expect(disposers).toHaveLength(1)
    expect(routes).toHaveLength(1)
    disposers[0]?.()
    expect(routes).toHaveLength(0)
  })

  it('tolerates a context without a logger', () => {
    const { ctx } = fakeContext({ withWebServer: true })
    const bare = { get: ctx.get, effect: ctx.effect }
    expect(() => apply(bare, undefined)).not.toThrow()
  })
})