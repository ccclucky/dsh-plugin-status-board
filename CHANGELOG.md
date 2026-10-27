# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-10-28

### Added

- **A segmented donut floating button (FAB) with status breakdown tooltip.** Replaces the
  pill with a 44px circular button carrying an SVG donut ring whose arcs scale with the
  proportions of the four session states (`decision`, `unread`, `executing`, `recent`).
  Displays core pending work in the center and expands a detailed four-status tally card on
  hover.
- **Dedicated completion unread board section.** Sessions with unopened completions are
  promoted into an independent "Completed unread" section in both the popover panel and
  the sidebar tree rather than being buried in recent records, keeping the inside boards
  in 100% parity with the four-segment floating ring. The section is permanently retained in
  both places to maintain consistent navigation hierarchy.
- **A completion reminder on session rows.** A session that finished a run, is not the one
  on screen, and has not been opened since now carries a small green dot on its status
  marker. The state is the platform's own `completionUnread`, read through the
  `useSessionStatus` standard slot prop, so the board cannot disagree with the sidebar
  about what "unread" means and nothing is stored locally.
- `GLOSSARY.md` gains **完成未读** and a sharpened **近期记录**, so neither can drift into
  meaning "unread messages" in a later change.

### Fixed

- The build verifier's React stand-in provided only `createElement` and
  `useSyncExternalStore`, so the first client change that used `createContext` failed the
  build with "client factory threw" although the bundle was correct. The stand-in now
  mirrors the members the browser module table actually provides.
- The reminder dot first sat on top of the status ring, so the row read as a ring with a
  bite taken out. Caught by looking at a 4× capture, where the two variants differ even
  though they are identical at 1×; the dot now sits on the ring's shoulder.
- **Hover jitter caused by containing-block transforms.** Tooltips inside `<button>` inherited
  the button's hover scale transform as a containing block, throwing fixed viewport
  coordinates offscreen. Tooltip popovers now render outside the button with bidirectional
  pointer tracking and smart edge clamping.

## [0.4.0] — 2026-10-27

### Added

- **The floating entry can be dragged.** The panel no longer sits in a fixed
  corner: it is placed from the entry's rectangle, so moving the entry takes the
  panel with it. The position is remembered across reloads. Dragging into the upper
  half flips the panel to open downward, and the entry is clamped into the viewport
  rather than being allowed to leave it.
- **Reset control** in the panel bar, next to the close button, disabled until the
  entry has actually been moved. It deletes the stored key rather than writing the
  default coordinates — a stored default is indistinguishable from a placement the
  user chose, which would leave the control permanently enabled.
- **Arrow-key nudging** (8px, doubled with Shift). Dragging is pointer-only, so
  without this a keyboard user would have no way at all to adjust the position.
- `GLOSSARY.md` and `docs/adr/0001` recording the vocabulary and the decision to
  keep the position in `localStorage` rather than in the plugin config.

### Changed

- **The entry now shows three status markers** instead of an icon, a text label and
  a single badge. They are the shared `StatusMark` component in the directory
  variant — the same component and shape language the sidebar tree uses before each
  section — each followed by its own tally. This makes the entry narrower (144px →
  129px), reports all three boards instead of just the decision count, and keeps a
  zero visible but dimmed so "nothing is waiting on me" is still readable. Narrow
  viewports keep the markers and drop the numbers.
- The reset glyph is an inline SVG (return-to-corner arrow) rather than a font
  character: a text symbol renders differently per platform and the usual candidates
  read as "expand" or "undo" instead of "put it back".

### Fixed

- Clicking the entry while the panel was open could not dismiss it: the panel was
  closed on `pointerdown` and the ensuing click reopened it. The panel is now
  dismissed only when the gesture crosses the drag threshold, which is also the
  point where a press stops being a click.
- The panel's height is measured before it is placed, and observed via a
  `ResizeObserver` so dynamic size changes (such as expanding question cards or
  toggling buckets) recalculate placement and prevent the panel from overflowing
  below the viewport.

## [0.3.0] — 2026-10-24

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
- **The recent-records window is 7 days by default** (168 hours, previously
  24). The hint prints "last 7 days" rather than "last 168 hours" when the
  window is a whole number of days.

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

### 中文发布说明

会话状态看板 **0.3.0**：两个入口，各司其职。

#### 两个入口
- **侧栏目录树**：点击「会话状态看板」行向下展开 3 个状态目录，像 3 个项目分组；点会话行直接打开会话，树里不放批准/回答按钮。
- **右下角悬浮胶囊**：点击打开完整看板，标题栏显示会话总数；保留筛选与三块状态。

#### 状态标记
- **目录静态**：待决策实心琥珀点、进行中蓝色弧线 + 实心核、近期灰点。
- **会话行动态**：待决策空心琥珀环缓慢呼吸；进行中蓝色弧线脉冲（不持续旋转）；近期记录静止。
- **空目录**不播放动画；`prefers-reduced-motion` 下所有动效自动关闭。

#### 浮窗题卡
- 决策行可展开题卡：`continued` 题通过 `remote.userQuestions.answer` 就地提交；`open` 题跳转到会话里的官方题卡。
- 支持选项、自定义回答、多选、提交/已提交/错误态；没有回答通道时卡片只读并引导打开会话。

#### 近期记录
- 默认窗口改为 **7 天（168 小时）**，提示显示「最近 7 天」而不是 168 小时。
- 仍受 `maxRecent`（默认 20）上限，超出部分会提示；需要更多可在配置中调大。

#### 修复与视觉
- 修复 `remote.userQuestions` 未注入导致浮层崩溃、侧栏树退化为浏览器默认按钮的问题。
- 轻底色树面板、单行会话、双行看板标题、按状态区分空文案、暖色题卡与选项圆点。
- 侧栏树自带样式，浮层异常不再影响导航样式。

安装/升级：

```bash
dsh plugin --profile <profile> add dsh-plugin-status-board@0.3.0
```

或在 Plugin Manager 中安装 `0.3.0`。

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