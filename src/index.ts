/**
 * The Host half of dsh-plugin-status-board.
 *
 * The board itself is rendered entirely by the Client half, because the
 * Harness already streams the session list to the browser (see
 * `references/practices.md`: "the framework drives; the plugin computes").
 * What the Host half owns is the one thing the browser cannot read — the
 * Loader row's validated `config` — plus its publication over a tiny read-only
 * route:
 *
 *   GET /status-board/config → { marker, config }
 *
 * `Config` is the schema the Loader validates `cordis.patch.yml` against, so an
 * operator edits real, bounded values in the Plugins page instead of guessing.
 * @module dsh-plugin-status-board
 */

import Schema from '@deepseek-ai/schemastery'
import { CONFIG_DEFAULTS, CONFIG_LIMITS, resolveConfig } from './shared/config.ts'
import { STATUS_BOARD_CONFIG_MARKER, STATUS_BOARD_CONFIG_PATH } from './shared/route.ts'
import type { ResolvedStatusBoardConfig, StatusBoardConfig } from './shared/types.ts'

/**
 * Loader row schema.
 *
 * Every field is optional with a default: `cordis.patch.yml` ships the
 * documented values, and a row that omits the whole `config` block must still
 * activate. Bounds mirror `CONFIG_LIMITS`; `tests/config.test.ts` pins the
 * resolver to the same ranges so the two cannot drift into disagreement.
 */
export const Config = Schema.object({
  recentWindowHours: Schema.number()
    .min(CONFIG_LIMITS.recentWindowHours.min)
    .max(CONFIG_LIMITS.recentWindowHours.max)
    .step(1)
    .default(CONFIG_DEFAULTS.recentWindowHours)
    .description('Width of the "近期记录 / Recent records" window, in hours.'),
  maxRecent: Schema.number()
    .min(CONFIG_LIMITS.maxRecent.min)
    .max(CONFIG_LIMITS.maxRecent.max)
    .step(1)
    .default(CONFIG_DEFAULTS.maxRecent)
    .description('Maximum rows shown in the "近期记录 / Recent records" board.'),
  defaultCollapsed: Schema.union([
    Schema.const('decision'),
    Schema.const('executing'),
    Schema.const('recent'),
    Schema.const('none'),
    Schema.const('all'),
  ])
    .default(CONFIG_DEFAULTS.defaultCollapsed)
    .description('Boards that start collapsed.'),
  showEmptyBuckets: Schema.boolean()
    .default(CONFIG_DEFAULTS.showEmptyBuckets)
    .description('Whether an empty board still renders its header.'),
})

// ── Structural faces of the Host services this plugin touches ────────────────
//
// The plugin deliberately does not import a Harness Host package: a published
// bundle resolves those from the running deployment, and a structural mirror
// keeps the bundle buildable in this repository while staying a plain runtime
// contract at load time (the same approach the shipped third-party plugins
// use).

/** Request face a route handler receives (the slice this plugin reads). */
export interface RouteRequest {
  readonly url?: string | undefined
  readonly method?: string | undefined
  readonly headers?: Record<string, string | readonly string[] | undefined> | undefined
}

/** Response face a route handler writes (the slice this plugin uses). */
export interface RouteResponse {
  statusCode: number
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

/** One exact-path route registration. */
export interface WebRoute {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (request: RouteRequest, response: RouteResponse) => void | Promise<void>
}

/** The web-server service face (`ctx.webServer`). */
export interface WebServerFace {
  register(route: WebRoute): () => void
}

/** The Cordis context slices this plugin consumes. */
export interface StatusBoardHostContext {
  get(name: string): unknown
  effect(callback: () => unknown, label?: string): unknown
  /**
   * Run `callback` once the named service is available, and again for each new
   * generation of it. Optional: a composition without it registers eagerly.
   */
  inject?:
    | ((deps: readonly string[], callback: (ctx: StatusBoardHostContext) => unknown) => unknown)
    | undefined
  logger?: { debug?(message: string): void } | undefined
}

/**
 * Write one JSON response.
 *
 * @param response - the route response.
 * @param status - HTTP status code.
 * @param body - value serialized with `JSON.stringify`; omitted for `HEAD`,
 *   whose response must carry the headers but no body.
 * @param extraHeaders - additional response headers (`Allow` on a 405).
 */
function writeJson(
  response: RouteResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  omitBody = false,
): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  })
  // HEAD must send the same headers with an empty body (RFC 9110 §9.3.2).
  response.end(omitBody ? '' : payload)
}

/** Methods this route answers. */
const ALLOWED_METHODS = 'GET, HEAD'

/**
 * Build the config route handler.
 *
 * Only `GET` and `HEAD` are answered. Every other method gets `405` with the
 * `Allow` header RFC 9110 §15.5.6 requires. The handler is pure and
 * synchronous, so it cannot fail on I/O.
 *
 * @param config - the resolved configuration to publish.
 */
export function createConfigHandler(
  config: ResolvedStatusBoardConfig,
): (request: RouteRequest, response: RouteResponse) => void {
  return (request, response) => {
    const method = (request.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      writeJson(response, 405, { marker: STATUS_BOARD_CONFIG_MARKER, error: 'method-not-allowed' }, { allow: ALLOWED_METHODS })
      return
    }
    const payload = { marker: STATUS_BOARD_CONFIG_MARKER, config }
    if (method === 'HEAD') {
      writeJson(response, 200, payload, {}, true)
      return
    }
    writeJson(response, 200, payload)
  }
}

/**
 * Activate the Host half.
 *
 * @param ctx - the Host context.
 * @param rawConfig - the Loader row's `config` (validated by {@link Config}
 *   before this runs, then re-clamped by the shared resolver).
 */
export function apply(ctx: StatusBoardHostContext, rawConfig?: StatusBoardConfig): void {
  const config = resolveConfig(rawConfig)

  /** Register the read-only route on whatever web server is current. */
  const registerRoute = (inner: StatusBoardHostContext): void => {
    const webServer = inner.get('webServer') as WebServerFace | undefined
    if (webServer === undefined || typeof webServer.register !== 'function') return
    inner.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: STATUS_BOARD_CONFIG_PATH,
          handler: createConfigHandler(config),
        }),
      'status-board: config route',
    )
  }

  // `webServer` can mount after this plugin (the Loader mounts rows in profile
  // order), so a one-shot `get` at activation would leave the route permanently
  // unregistered and the Client silently stuck on defaults. `ctx.inject` waits
  // for the service and re-runs per generation; a composition without it
  // registers eagerly, which is what the unit tests exercise.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], registerRoute)
  } else {
    registerRoute(ctx)
  }

  // One line at activation lets an operator confirm from the log that the
  // patch's values were the effective ones (the Plugins page shows the raw
  // config, not the resolved one).
  ctx.logger?.debug?.(
    `status-board: window=${config.recentWindowHours}h cap=${config.maxRecent} ` +
      `collapsed=${config.defaultCollapsed} empty=${String(config.showEmptyBuckets)}`,
  )
}

export type { ResolvedStatusBoardConfig, StatusBoardConfig } from './shared/types.ts'