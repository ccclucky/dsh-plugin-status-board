<div align="center">

# Session Status Board

**A DSH plugin that sorts your sessions into three collapsible boards — so you can see at a glance where every session actually stands.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/dsh-plugin-status-board.svg)](https://www.npmjs.com/package/dsh-plugin-status-board)
[![npm downloads](https://img.shields.io/npm/dm/dsh-plugin-status-board.svg)](https://www.npmjs.com/package/dsh-plugin-status-board)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-247bbf.svg)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · English

</div>

---

## What it is

`dsh-plugin-status-board` is a Web UI plugin for DeepSeek Harness (DSH). It takes the sessions scattered down the sidebar and re-groups them by **what they actually need from you right now**, across three collapsible boards:

| Board | Rule | The question it answers |
| :--- | :--- | :--- |
| **Needs my decision** | The session is waiting on your reply: a tool parked on `ask_user_question` (plan review included), or a Lead session holding a ready-and-unclaimed team task | “What must I handle now?” |
| **Running** | The agent is working and needs nothing from you | “What is running in the background?” |
| **Recent records** | Everything else that saw activity inside the time window | “What moved recently?” |

Classification is **exclusive**: one session appears on exactly one board. That is the point — the native sidebar sorts by workspace and time, so it cannot tell you *who is waiting on you*; this board sorts by **action priority**.

> **Demo placeholders**
> Screenshots/GIF pending: `docs/demo-light.png`, `docs/demo-dark.png`, `docs/demo-collapse.gif`.
> Wide screens render the three boards as a multi-column grid; at ≤720px they stack into one column.

---

## Features

- **Three responsive collapsible boards** — `Needs my decision` / `Running` / `Recent records`. Only the archival board starts collapsed, so the two that matter stay open.
- **Correct precedence** — a session waiting on your decision lands on the decision board even while its agent is still running; it never drowns in "Running".
- **Live, not polled** — subscribes to the session list Harness already publishes. No polling, no re-scanning session logs.
- **Remembers your collapse choices** — persisted per browser in `localStorage`.
- **Bilingual** — UI copy and the Plugin Manager's title/description follow the Harness language setting (Chinese / English).
- **Theme-aware** — every colour comes from Harness theme tokens, so light and dark themes follow automatically.
- **Keyboard and screen-reader accessible** — each board's title is a real `<h2>` wrapping a disclosure `<button>` (the WAI-ARIA accordion pattern), with `aria-expanded` and an `aria-controls` that always resolves; the label announces the board, the action and the row count. The panel is named via `aria-labelledby`, and DOM ids come from `useId`, so two mounted panels never collide.
- **Honest empty and truncation states** — an empty board and a capped "Recent records" board both say so; nothing is dropped silently.

---

## Install

### Option 1 — Plugin Manager (recommended)

1. Open the DSH Web UI → **Settings → Plugins**.
2. Choose **Install bundle** and supply the **absolute path** to this package (local directory install), or the package name once published.
3. Reload the page. A board icon appears in the sidebar footer; click it to open the panel.

### Option 2 — CLI, from npm (recommended for scripted setups)

The package is published to npm; the built `lib/` output ships with it, so no clone or build is needed:

```bash
npm install -g dsh-plugin-status-board        # or: npm i dsh-plugin-status-board
dsh plugin --profile <profile> add dsh-plugin-status-board
```

### Option 3 — From a local directory

```bash
# the directory must already contain the lib/ build output
dsh plugin --profile <profile> add /absolute/path/to/dsh-plugin-status-board
```

### Option 4 — From source (required before a Git install)

`lib/` is build output and is not tracked. After cloning, build first, then install:

```bash
git clone https://github.com/ccclucky/dsh-plugin-status-board.git
cd dsh-plugin-status-board
pnpm install
pnpm build      # emits lib/index.js (Host) and lib/client.js (Client)
pnpm test       # runs the full unit suite

# then hand the built directory to the CLI
dsh plugin --profile <profile> add .
```

Build output:

```
lib/
├── index.js              # Host half (ESM, loaded by the Cordis Loader)
├── client.js             # Client half (__ModuleLoader__ envelope)
└── types/**/*.d.ts       # Type declarations
```

---

## Configuration

Configuration lives on the plugin row in `cordis.patch.yml`, and can also be edited in **Settings → Plugins → this plugin** (the `Config` schema renders the form, with range validation).

```yaml
- insert:
    - id: status-board
      name: 'dsh-plugin-status-board'
      config:
        recentWindowHours: 24
        maxRecent: 20
        defaultCollapsed: recent
        showEmptyBuckets: true
```

| Option | Type | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `recentWindowHours` | number | `24` | 1 – 720 | Width of the "Recent records" window, in hours. Sessions older than this are excluded from that board. |
| `maxRecent` | number | `20` | 1 – 200 | Maximum rows on the "Recent records" board. The overflow is reported at the board's foot as “N older sessions are hidden”. |
| `defaultCollapsed` | string | `recent` | `decision` / `executing` / `recent` / `none` / `all` | Which board(s) start collapsed on first load. Once the user toggles a board, their choice wins. |
| `showEmptyBuckets` | boolean | `true` | `true` / `false` | Whether an empty board still renders its header. `false` hides empty boards entirely. |

> Out-of-range numbers are **clamped**, wrong types **fall back** to the default. A typo in a hand-edited patch must never blank the whole panel.

---

## How it works

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Host half (Node)            │        │ Client half (Browser)        │
│                             │        │                              │
│ Config schema validate/clamp│───────▶│ GET /status-board/config     │
│                             │  JSON  │   ↓ on failure: defaults     │
│ Read-only config route      │        │ session-list snapshot ──┐    │
└─────────────────────────────┘        │   (Harness publishes it)│    │
                                       │                         ▼    │
                                       │     classify / sort / cap    │
                                       │                         ▼    │
                                       │  sidebar.panellist → icon    │
                                       │  main(key=...)     → panel   │
                                       └──────────────────────────────┘
```

Three deliberate trade-offs:

1. **The board is computed in the Client half.** Harness already pushes the session list to the browser, so the plugin subscribes; classifying client-side gives zero extra requests and zero latency, and keeps the Host half thin.
2. **The Host half only publishes configuration.** The one thing the browser cannot read is what the operator put in `cordis.patch.yml`, so there is exactly one read-only, uncached JSON route.
3. **The runtime snapshot shape appears in one file.** `src/client/session-source.ts` is the only adapter; when a Harness release renames a field, that file changes and the classifier, the view and every test keep working.

---

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit, strict + exactOptionalPropertyTypes
pnpm test        # vitest, 168 cases
pnpm build       # clean → declarations → both halves → Client envelope wrap → self-check
pnpm verify      # artefact self-check only (run pnpm build first)
pnpm test:watch  # watch mode
```

### Layout

```
dsh-plugin-status-board/
├── src/
│   ├── index.ts                 # Host half: Config schema + read-only route
│   ├── shared/                  # Pure logic shared by both halves (no Harness import)
│   │   ├── board.ts             #   classify / sort / window / cap / collapse
│   │   ├── config.ts            #   defaults and clamping
│   │   ├── i18n.ts              #   dictionaries, interpolation, relative time
│   │   ├── route.ts             #   cross-process constants
│   │   └── types.ts             #   shared type contract
│   └── client/
│       ├── index.tsx            # slot registration (icon + panel + styles + dicts)
│       ├── Panel.tsx            # the three-board view
│       ├── store.ts             # external store (useSyncExternalStore)
│       ├── session-source.ts    # the single runtime-snapshot adapter
│       └── styles.ts            # theme-token-driven styles
├── locale/{zh,en}.json          # UI copy + Plugin Manager metadata
├── tests/                       # 168 unit tests
├── scripts/                     # clean + Client envelope wrapper
├── cordis.patch.yml             # bundle patch (with default config)
└── tsdown.config.ts             # two independent builds
```

### Test coverage

| File | Covers |
| :--- | :--- |
| `board.test.ts` | precedence, stable ordering, time window, truncation counts, collapse state |
| `config.test.ts` | defaults, clamping, wrong-type fallback |
| `i18n.test.ts` | zh/en key parity, required-key validation, single-pass interpolation, relative time |
| `session-source.test.ts` | snapshot adaptation, subagent/blank filtering, decision projection, malformed rows |
| `store.test.ts` | subscriptions, change detection, collapse persistence, late config must not clobber a click |
| `panel.test.tsx` | server-rendered: three boards, collapse, resolvable aria relations, loading/empty/error, theme tokens |
| `host.test.ts` | GET/HEAD/405 handling, Allow header, effect cleanup, late-mounting webServer |
| `manifest.test.ts` | manifest / patch / locale / icon / MIT LICENSE consistency |
| `artifacts.test.ts` | built output: real Host exports, Client envelope, external React, inlined dicts, unrewritten styles |

---

## FAQ

**Why don't I see some of my sessions?**
The board lists top-level sessions only. Sessions spawned as **subagent children** (`origin: 'subagent'`, or a row carrying a parent id) are already reflected on their parent, and a **blank** session that never exchanged a message has no state to report — its default title is just the workspace name, which reads as a phantom row.

**A session is on "Needs my decision" but it is still running — why?**
By design. "The agent is still working" and "it cannot proceed without your call" can both be true, and the second one is the blocker. The decision is derived from two real runtime projections: `userQuestions.active` (a tool waiting for the human, plan review included) and `agentTeam.tasks` (a ready, unclaimed team task).

**What happens when I click a session row?**
It navigates through the Harness `uiWorkspace.openSession` service. When that service is not part of the composition, rows render as static text rather than as buttons that do nothing.

**Where is the collapse state stored?**
Browser `localStorage` under `dsh-plugin-status-board.collapse.v1`. Clear that key to fall back to the configured default. If storage is unavailable (private mode), the choice degrades to this page's lifetime automatically.

**What is left behind after uninstall?**
Nothing. The styles are a `<style>` element inside the panel component, so unmounting removes them; every slot registration and subscription is owned by a `ctx.effect`, so unload releases it.

---

## License

[MIT](LICENSE) © 2026 CCLUCKY