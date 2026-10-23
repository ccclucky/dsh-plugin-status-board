# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-10-23

The board moves out of the main column and into the sidebar, and the decision
rule is corrected against real session logs. Both changes are user-visible, so
this is a minor release rather than a patch.

### Changed

- **The board lives in the sidebar now.** A *Session Status Board* row sits in
  the sidebar nav list, directly under the shipped rows, followed by three
  counts (decision · running · recent). Clicking it opens the board as a
  floating panel beside that row; `Esc`, an outside press, or the panel's ×
  dismisses it. `0.1.0` rendered the board as a main-column page, selected from
  a standalone sidebar icon, which meant leaving the conversation to read it.
- The panel is anchored to the entry's measured position when it opens, so it
  appears next to the row that was clicked instead of at a fixed spot.
- Section headers carry a small tally; only the decision board states its size
  in words, because it is the one board asking the user to act.

### Fixed

- **The decision board listed sessions that had finished.** The rule keyed on a
  ready, unclaimed team task. Reading 188 durable session logs on disk showed
  that a task row carries only `id / revision / subject / status` — there is no
  `ready` field — and that a finished ticket keeps its rows `pending` forever.
  A session that had ended six days earlier was therefore pinned to the decision
  board. The rule now reads `userQuestions.active` alone, which is the one
  projection that actually means "this session cannot continue without you".
- The floating panel no longer spans the whole frame with pointer events
  enabled, which would have made the rest of the application unclickable.

### Removed

- The `main`-column panel registration and the standalone sidebar icon. The
  board is reachable from one place, so there is no second, differently-behaving
  entry to learn.

## [0.1.0] — 2026-10-22

First release.

### Added

- Three collapsible boards — needs my decision, running, recent records —
  computed on the client from the session list the Harness already publishes.
- Classification order is exclusive: decision outranks running, running outranks
  recent, so every session appears on exactly one board.
- Bilingual interface (zh / en) with a parity check between the two dictionaries.
- Four operator settings (`recentWindowHours`, `maxRecent`, `defaultCollapsed`,
  `showEmptyBuckets`), validated and clamped by the Loader, published to the
  browser over one read-only route.
- `GET /status-board/config` — `GET`/`HEAD` only, `405` with an `Allow` header
  for anything else.
- Collapse state persisted in `localStorage`, degrading to per-page state when
  storage is unavailable.