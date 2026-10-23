# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-10-23

The board now has **two entry surfaces**, split by job: the sidebar row expands
an inline navigation tree, and a compact floating button opens the full board.

### Added

- **An inline status tree under the sidebar row.** Clicking `会话状态看板`
  expands 3 folders — 待我决策 / 正在执行 / 近期记录 — each containing the
  sessions classified into it. The tree is a *navigation* surface: a session row
  opens that session, exactly like the Workspace browser. It renders no approval
  or answer controls.
- **True inline placement, with a fallback.** `sidebar.panellist` exposes only
  the row's icon cell, so the tree is portaled into the sidebar's `nav` after
  the row (pushing the Workspace list down, not covering it). If the shell no
  longer exposes a nav, the same tree falls back to a fixed panel under the row.
  The tree closes when the sidebar collapses to its 56px rail.
- **A floating board button.** A compact button in the bottom-right corner opens
  the current board as a popover. It replaces the old nav-row trigger; the board
  content (filter + 3 boards) is unchanged.
- **L2 question cards in the floating board.** Decision rows with a
  `userQuestions` payload get an answer toggle. Continued questions submit their
  full answer batch through `remote.userQuestions.answer`; open questions stay
  read-only and link to the session's own card. The card supports options,
  custom text, multi-select, per-call batches, submitting/sent/error states, and
  is read-only when the composition exposes no answer Remote.

### Changed

- The sidebar row no longer opens the floating board; it toggles the tree. The
  old row badge/measurement code and the overlay's row anchoring are removed.
- **Visual pass.** The tree is a tonal folder panel with single-line session
  rows and per-board empty copy; the board has a two-line header (title +
  session total), and a tinted question card with option marks. The floating
  entry is a labelled pill at the bottom-right instead of a bare icon square.
- **Status marks carry state, not just colour.** Directories are static: a
  solid amber dot inside a halo (decision), a blue arc with a solid core
  (executing), a grey dot/ring (history). Session rows are alive where it
  matters: a hollow amber ring breathes on a decision, a blue arc pulses on
  work in flight, and history stays still. Nothing rotates, and motion switches
  off under `prefers-reduced-motion`.

### Fixed

- **The new overlay crashed on first render and took the whole surface with
  it.** `resolveAnswer` read `remote.userQuestions` through `ctx.get` without
  declaring it on the context, so Cordis threw; the overlay's stylesheet and
  floating button never mounted, and the tree fell back to unstyled browser
  buttons. The service is now acquired through a child `ctx.inject`, so a
  composition without user-questions still renders the board read-only.
- The tree carries its own copy of the stylesheet, so a broken or unmounted
  overlay can never leave default browser buttons in the navigation again.
- Question payloads are narrowed before rendering: malformed calls, empty
  question ids and bad options are dropped without taking down the board.
- Question changes now participate in the store's structural comparison, so a
  changed option list re-renders the card instead of showing stale labels.

## [0.2.2] — 2026-10-23

No change to the shipped code: every byte of the plugin is identical to 0.2.1.
This release exists to move publishing itself into CI, which is what makes the
published artefacts attributable — see *Provenance* below.

### Added

- **A release pipeline.** Publishing now happens in CI, triggered by clicking
  *Publish release* on a GitHub Release, and never by a local `npm publish`. The
  tag and the draft release are the staging area; the click is the single human
  gate. Before publishing, the workflow asserts that the tag, `package.json` and
  the registry agree — the check whose absence let `0.1.0` reach npm with no
  matching git tag — derives `--tag next` for pre-release versions so `latest`
  cannot be polluted, and installs the published package into a clean directory
  afterwards to catch packaging mistakes a build cannot see.
- `workflow_dispatch` entry point with a default **dry run**, so the chain can
  be proven without shipping anything.

### Fixed (found by the first real run of this pipeline)

0.2.2 published successfully — `Publish to npm` passed and the registry confirms
the version carries a SLSA provenance attestation — but the *install-back* step
of that same run went red. The published artefact was fine; the check was wrong.

- The step failed with `ETARGET: No matching version found`, i.e. the registry
  had not yet made the just-published version visible to that runner. That is
  normal propagation lag, not a defect.
- The defect was conflating two different failure modes in one retry loop: "the
  registry has not caught up" and "the package cannot be installed". Eight
  attempts across 150 seconds all landed inside the propagation window, so a
  publish that had worked was reported as a failure.
- Now: visibility is polled first (`npm view`, bounded at 30 × 20s), and only
  after the version is visible is it installed, **once** — a failure at that
  point really is a packaging defect, and the two cases now report differently.
- Added an assertion that the provenance attestation is actually reachable on
  the registry, rather than assuming `--provenance` on the command line implies
  an attached attestation.

### Changed

- The npm credential moved out of the maintainer's laptop and into a repository
  secret (`NPM_TOKEN`, passed as `NODE_AUTH_TOKEN`), so releases no longer depend
  on whoever happened to have a working `.npmrc` that day.
- `--provenance` is requested on every publish, which needs the runner's
  `id-token: write` permission to obtain a Sigstore certificate. Publishing is
  authenticated by the token; provenance is attested by the OIDC identity — the
  two are complementary, and dropping the permission loses the attestation
  silently rather than failing the publish.

## [0.2.1] — 2026-10-23

### Fixed

- **The three counts rendered as two black dots and one invisible dot.** The
  boards and the nav-row readout keyed their state colour on
  `--dsw-alias-brand-primary` and `--dsw-alias-state-idle-primary`. A token's
  name is not its value: resolved against the shipped theme, `brand-primary` is
  near-black and `idle-primary` is a grey that disappears on a white sidebar.
  The accents now use the three tokens that actually resolve to distinguishable
  states in **both** themes — `state-warn-label` (amber, a decision),
  `state-business-primary` (the product blue, work in flight) and
  `label-tertiary` (mid-grey, history) — and the readout's numbers stay in the
  row's own text colour so the dots do the signalling.
- **The floating panel never appeared in the running app.** It is styled by the
  board's stylesheet, which only mounted with the panel, so the closed state had
  an unstyled — and therefore invisible — readout. The stylesheet now mounts with
  the overlay entry itself.
- **The panel anchored to a stale position.** The nav row is marked by a sibling
  slot registration whose effect can run after the overlay's, so the first
  measurement found nothing and gave up. Measurement now retries across frames
  and ignores a row that has not been laid out yet.
- The decision board's readout and the nav-row count pill shared the class name
  `status-board__metric`, so each inherited the other's box. They are now
  `status-board__readout` and `status-board__metric`.
- Border and hairline steps that used `border-l1` (4% black, invisible on white)
  moved to a visible step.

### Changed

- Panel rhythm follows the reference: 18px between boards, 11.5px section
  labels, 30px rows with a 13px title, and a 24px decision figure.
- The floating panel's bar shows the short title and a bare total; the full
  sentence remains the number's accessible name.

### Removed

- The sidebar-foot strip and the collapsed-rail trigger, along with the
  `sidebar.footer.action` registration. The nav row is the only entry, so there
  is no second control to keep in sync.

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