/**
 * The one path both halves must agree on for the configuration hand-off.
 *
 * It lives in its own module so importing the constant never drags a
 * Host-only or browser-only module into the other half's bundle.
 * @module dsh-plugin-status-board/shared/route
 */

/**
 * Exact HTTP path that serves the resolved configuration as JSON.
 *
 * The Host half registers it on the web server; the Client half fetches it once
 * per page load and falls back to {@link CONFIG_DEFAULTS} when the request
 * fails (a non-web profile, a restart mid-load, or an installed-but-disabled
 * Host half). The payload is non-sensitive: four numeric/boolean knobs.
 */
export const STATUS_BOARD_CONFIG_PATH = '/status-board/config'

/** Marker field so a stray reverse proxy response cannot pass as our payload. */
export const STATUS_BOARD_CONFIG_MARKER = 'dsh-plugin-status-board'