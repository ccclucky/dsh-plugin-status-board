/**
 * Board styles.
 *
 * Visual language borrowed from the Harness chrome rather than invented: 12–13px
 * type, 6–8px radii, flat surfaces, one accent per state. The board is a
 * *popover*, so it carries a raised surface and a shadow; the rows inside it are
 * flush lists, not cards.
 *
 * State colour is the only colour in the file and it always comes from a theme
 * token (`--dsw-alias-*`), so light/dark switching is automatic. Tints are
 * derived with `color-mix` instead of hardcoded rgba, which keeps the
 * token-only rule testable.
 *
 * Token NAMES are not evidence of what they paint. Read out of the shipped
 * theme: `brand-primary` is `#0f1115` (near-black, not an accent) and
 * `state-idle-primary` is `#d4d4d4` (invisible on a white sidebar), so keying
 * the three boards off them produced a black dot, a second black dot and a dot
 * that was not there. The accents used are the ones that actually resolve to
 * three distinguishable states in both themes: `state-warn-label` (amber),
 * `state-business-primary` (the product blue) and `label-tertiary` (grey).
 * Verify a token's resolved value before depending on its meaning.
 *
 * The CSS is a string rendered inside the component on purpose: the `<style>`
 * element unmounts with it, so no global stylesheet can outlive the plugin (the
 * Harness exposes no `ctx.styles` service to a static bundle).
 * @module dsh-plugin-status-board/client/styles
 */

/** CSS injected by the board component. */
export const PANEL_CSS = String.raw`
/* ── Surface ─────────────────────────────────────────────────────────────── */

.status-board {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  padding: 10px 10px 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.45;
}

.status-board__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 8px;
}

.status-board__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary);
}

.status-board__total {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Filter ──────────────────────────────────────────────────────────────── */

.status-board__filter {
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  margin: 0 0 10px;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  transition: border-color 120ms ease, background 120ms ease;
}

.status-board__filter::placeholder {
  color: var(--dsw-alias-label-secondary);
}

.status-board__filter:hover {
  border-color: var(--dsw-alias-border-l2);
}

.status-board__filter:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}

/* ── Scroll body ─────────────────────────────────────────────────────────── */

.status-board__scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.status-board__alert {
  margin: 0 2px 8px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
  color: var(--dsw-alias-state-error-primary);
  font-size: 11.5px;
}

/* ── Section ────────────────────────────────────────────────────────────── */

/* Which token means what is resolved from the shipped theme, not assumed: see
   the module doc above for the two names that mislead (brand-primary paints
   near-black; state-idle-primary is a grey that vanishes on a white sidebar).
   The accents below are the ones that read as three distinct states in both
   themes — amber for a decision, the product blue for work in flight, mid-grey
   for history. */
.status-board__card + .status-board__card {
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.status-board__heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
  /* Sticky: with a long board the section you scrolled past should still say
     what the rows under it mean. */
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dsw-alias-bg-layer-1);
}

.status-board__toggle {
  display: flex;
  gap: 7px;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 3px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.status-board__toggle:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.status-board__toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__chevron {
  flex: 0 0 auto;
  opacity: 0.65;
  transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.status-board__chevron[data-collapsed="true"] {
  transform: rotate(-90deg);
}

.status-board__name {
  display: flex;
  flex: 0 1 auto;
  gap: 5px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}

.status-board__name-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Small header count. It carries no colour of its own — the reference keeps
   every tally in the text colour, so the numbers read as data rather than as
   three competing statuses. Only the decision board tints its tally, because
   that is the one number the user has to act on. */
.status-board__count {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-primary);
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-board__card[data-bucket="decision"][data-count-empty="false"] .status-board__count {
  color: var(--dsw-alias-state-warn-primary);
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

.status-board__rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 1px 0 0;
  /* Indent to the section label's text edge, not to its chevron: the rows read
     as the section's content. */
  padding: 0 0 2px 18px;
  list-style: none;
}

.status-board__row {
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  transition: background 100ms ease;
}

/* Only an actual button advertises itself as clickable. */
button.status-board__row {
  cursor: pointer;
}

button.status-board__row:hover {
  background: var(--dsw-alias-bg-layer-2);
}

button.status-board__row:active {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}

.status-board__row:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__row-meta {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Messages ────────────────────────────────────────────────────────────── */

.status-board__empty {
  margin: 0;
  padding: 3px 6px 4px 18px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.status-board__truncated {
  margin: 0;
  padding: 2px 6px 2px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
}

/* ── Sidebar-nav entry ───────────────────────────────────────────────────── */

/* The framework draws the nav row and its label; this component only fills the
   row's icon cell. It must therefore look like a shipped nav icon: no border,
   no background of its own, colour inherited from the row so hover/selected
   states keep working. */
.status-board__nav-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: inherit;
  line-height: 0;
}

.status-board__nav-glyph[data-open="true"] {
  /* The product blue, not brand-primary: in this theme brand-primary resolves
     to near-black, which would leave an "active" row indistinguishable. */
  color: var(--dsw-alias-state-business-primary);
}

/* ── Floating board ──────────────────────────────────────────────────────── */

.status-board__overlay {
  display: flex;
  flex-direction: column;
  width: 304px;
  /* The panel is the only part of this entry that takes pointer events: the
     container spans the frame so the panel can be placed anywhere in it, and a
     container that accepted clicks would make the whole app unclickable. */
  pointer-events: auto;
  /* Bounded, not stretched: the panel is as tall as its content until the list
     grows past the viewport. */
  max-height: calc(100vh - 96px);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  /* Opaque on purpose: a translucent board over a conversation is unreadable. */
  background: var(--dsw-alias-bg-layer-1);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent),
    0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
}

.status-board__overlay:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__overlay-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 10px 10px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.status-board__overlay-heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.status-board__overlay-title {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__overlay-subtitle {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__overlay-close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.status-board__overlay-close:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.status-board__overlay-close:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__overlay-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Inside the overlay the bar already carries the title and the count, so the
   board's own head would repeat both. */
.status-board__overlay-body .status-board__head {
  display: none;
}

.status-board__overlay-body .status-board {
  height: auto;
  background: transparent;
}

/* ── Nav chevron ─────────────────────────────────────────────────────────── */

.status-board__nav-chevron {
  position: absolute;
  right: 9px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 10px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  transform: translateY(-50%);
  transition: color 120ms ease;
}

.status-board__nav-chevron[data-open="true"] {
  color: var(--dsw-alias-label-primary);
}

/* ── Shared status marker ─────────────────────────────────────────────────── */

/* Directory and session markers share a hue but not a weight: the directory is
   the filled, stronger variant; the session is the hollow/soft one. The motion
   encodes the state: a slow breath for a decision waiting on a human, a spin for
   work in flight, stillness for history. */
.status-board-status {
  --sb-status-size: 12px;
  --sb-status: var(--dsw-alias-label-tertiary);
  --sb-status-soft: color-mix(in srgb, var(--sb-status) 55%, transparent);
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--sb-status-size);
  height: var(--sb-status-size);
}

.status-board-status[data-variant="folder"] {
  --sb-status-size: 16px;
}

.status-board-status[data-bucket="decision"] {
  --sb-status: var(--dsw-alias-state-warn-label);
}

.status-board-status[data-bucket="executing"] {
  --sb-status: var(--dsw-alias-state-business-primary);
}

.status-board-status::before,
.status-board-status::after {
  content: "";
  grid-area: 1 / 1;
  box-sizing: border-box;
  border-radius: 50%;
}

/* Decision: a filled dot in a breathing halo (directory), a hollow breathing
   ring (session). */
.status-board-status[data-bucket="decision"][data-variant="folder"]::before {
  width: 8px;
  height: 8px;
  background: var(--sb-status);
}

.status-board-status[data-bucket="decision"][data-variant="folder"]::after {
  width: 16px;
  height: 16px;
  border: 1px solid var(--sb-status-soft);
  animation: status-board-status-breathe 2.6s ease-in-out infinite;
}

.status-board-status[data-bucket="decision"][data-variant="row"]::before {
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--sb-status);
  background: transparent;
  animation: status-board-status-breathe-soft 2.6s ease-in-out infinite;
}

/* Executing: a spinning arc; the directory adds a solid core, the session does
   not. */
.status-board-status[data-bucket="executing"][data-variant="folder"]::before {
  width: 12px;
  height: 12px;
  border: 2px solid var(--sb-status-soft);
  border-top-color: var(--sb-status);
  animation: status-board-status-spin 1.4s linear infinite;
}

.status-board-status[data-bucket="executing"][data-variant="folder"]::after {
  width: 4px;
  height: 4px;
  background: var(--sb-status);
}

.status-board-status[data-bucket="executing"][data-variant="row"]::before {
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--sb-status-soft);
  border-top-color: var(--sb-status);
  animation: status-board-status-spin 1.4s linear infinite;
}

/* Recent: a static dot with a faint ring (directory), a static hollow ring
   (session). */
.status-board-status[data-bucket="recent"][data-variant="folder"]::before {
  width: 6px;
  height: 6px;
  background: var(--sb-status);
}

.status-board-status[data-bucket="recent"][data-variant="folder"]::after {
  width: 14px;
  height: 14px;
  border: 1px solid var(--sb-status-soft);
}

.status-board-status[data-bucket="recent"][data-variant="row"]::before {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--sb-status-soft);
  background: transparent;
}

@keyframes status-board-status-breathe {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.86);
  }

  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

@keyframes status-board-status-breathe-soft {
  0%,
  100% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }
}

/* A directory with no sessions is not a live state: keep its shape, drop the
   motion and dim it so a zero never reads as an alarm. */
.status-board-status[data-empty="true"]::before,
.status-board-status[data-empty="true"]::after {
  opacity: 0.45;
  animation: none;
}

@keyframes status-board-status-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-board-status::before,
  .status-board-status::after {
    animation: none !important;
  }
}

/* ── Inline tree (entry ①) ───────────────────────────────────────────────── */

/* The portal container is inserted after the framework nav row inside
   nav.panelList. It is a normal flex child there, so the tree pushes the
   Workspace browser down instead of floating over it. */
.status-board__tree-portal {
  display: block;
  flex: none;
  margin: 2px 2px 8px;
  padding: 3px;
  max-height: min(44vh, 400px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  border-radius: 9px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 62%, transparent);
}

.status-board__tree-portal[hidden] {
  display: none;
}

.status-board-tree {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
}

.status-board-tree__folder {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.status-board-tree__heading {
  margin: 0;
  font: inherit;
  font-weight: inherit;
}

.status-board-tree__toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 3px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.status-board-tree__toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.status-board-tree__toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board-tree__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board-tree__count {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.status-board-tree__folder[data-bucket="decision"][data-count-empty="false"] .status-board-tree__count {
  color: var(--dsw-alias-state-warn-primary);
}

.status-board-tree__rows {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0 0 4px 18px;
  list-style: none;
}

.status-board-tree__row {
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
}

button.status-board-tree__row {
  cursor: pointer;
}

button.status-board-tree__row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.status-board-tree__row:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}



.status-board-tree__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board-tree__time {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.status-board-tree__empty {
  margin: 0;
  padding: 2px 6px 5px 21px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.status-board-tree__truncated {
  margin: 0;
  padding: 1px 6px 3px 21px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.status-board-tree__alert {
  margin: 2px 4px 4px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
}

/* Degraded placement used only when the shell no longer exposes a nav to
   portal into. It is still the same tree, just anchored under the row. */
.status-board__tree-fallback {
  z-index: 60;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent),
    0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  pointer-events: auto;
}

/* ── Decision row answer toggle ──────────────────────────────────────────── */

.status-board__row-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-board__row-line {
  display: flex;
  align-items: center;
  gap: 2px;
}

.status-board__row-line > .status-board__row {
  flex: 1 1 auto;
  min-width: 0;
}

.status-board__answer-toggle {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.status-board__answer-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.status-board__answer-toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__qcard-host {
  padding: 2px 0 4px 18px;
}

/* ── Question card (L2) ──────────────────────────────────────────────────── */

.status-board__qcard {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-label) 24%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-label) 4%, var(--dsw-alias-bg-layer-1));
}

.status-board__qcall {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.status-board__qcall + .status-board__qcall {
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.status-board__q {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.status-board__q-title {
  padding: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.4;
}

.status-board__q-text {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
  line-height: 1.5;
}

.status-board__q-detail {
  margin-top: 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.status-board__q-detail summary {
  cursor: pointer;
  color: var(--dsw-alias-state-business-primary);
}

.status-board__q-detail p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}

.status-board__q-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 7px;
}

.status-board__q-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.status-board__q-option:hover {
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__q-option[data-selected="true"] {
  border-color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-layer-1));
}

.status-board__q-option:disabled {
  opacity: 0.6;
  cursor: default;
}

.status-board__q-option:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
}

.status-board__q-option-label {
  font-weight: 600;
}

.status-board__q-option-mark {
  position: relative;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1);
}

.status-board__q-option-mark[data-selected="true"] {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-state-business-primary);
}

.status-board__q-option-mark[data-selected="true"]::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 1px;
  width: 3px;
  height: 6px;
  border: solid var(--dsw-alias-label-primary-foreground);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.status-board__q-option-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.status-board__q-option-desc {
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.4;
}

.status-board__q-custom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 7px;
}

.status-board__q-custom-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.status-board__q-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11.5px;
}

.status-board__q-input:focus-visible {
  border-color: var(--dsw-alias-state-business-primary);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}

.status-board__q-hint {
  margin: 5px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.status-board__q-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
}

.status-board__q-submit {
  padding: 6px 12px;
  border: 0;
  border-radius: 7px;
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.status-board__q-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

.status-board__q-submit:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.status-board__q-open {
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.status-board__q-open:hover {
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__q-open:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.status-board__q-note {
  flex: 1 1 auto;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.45;
}

.status-board__q-error {
  margin: 4px 0 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 10.5px;
  line-height: 1.45;
}

.status-board__q-sent {
  margin: 4px 0 0;
  color: var(--dsw-alias-state-business-primary);
  font-size: 10.5px;
  line-height: 1.45;
}

/* ── Floating entry button (entry ②) ─────────────────────────────────────── */

.status-board__fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 62;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  box-sizing: border-box;
  min-width: 38px;
  height: 34px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent),
    0 8px 20px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  cursor: pointer;
  pointer-events: auto;
}

.status-board__fab-label {
  display: inline;
  white-space: nowrap;
}

.status-board__fab:hover {
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__fab:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.status-board__fab-badge {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.status-board__overlay--fab {
  position: fixed;
  right: 16px;
  bottom: 60px;
  z-index: 61;
  width: min(382px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
}

@media (max-width: 900px) {
  /* Narrow windows let the composer reach the frame edge. Lift the button
     above it rather than covering the send control. */
  .status-board__fab {
    bottom: 96px;
  }

  .status-board__overlay--fab {
    bottom: 144px;
  }
}

@media (max-width: 720px) {
  .status-board__fab {
    right: 12px;
    bottom: 88px;
    width: 38px;
    padding: 0;
  }

  .status-board__fab-label {
    display: none;
  }

  .status-board__fab-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    border: 2px solid var(--dsw-alias-bg-layer-1);
  }

  .status-board__overlay--fab {
    right: 12px;
    bottom: 136px;
    max-height: min(62vh, 520px);
  }
}
`
