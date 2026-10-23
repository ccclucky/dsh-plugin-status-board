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
  margin: 0 0 8px;
  padding: 5px 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
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
  gap: 18px;
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
.status-board__card {
  /* Each board owns an accent; everything inside reads it, so one declaration
     per board colours its count pill, its rows' dots, and its rule. */
  --sb-accent: var(--dsw-alias-label-tertiary);
}

.status-board__card[data-bucket="decision"] {
  --sb-accent: var(--dsw-alias-state-warn-label);
}

.status-board__card[data-bucket="executing"] {
  --sb-accent: var(--dsw-alias-state-business-primary);
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
  gap: 6px;
  align-items: center;
  width: 100%;
  min-height: 26px;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
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
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Small header count. It carries no colour of its own — the reference keeps
   every tally in the text colour, so the numbers read as data rather than as
   three competing statuses. Only the decision board tints its tally, because
   that is the one number the user has to act on (and the one that also gets
   the large readout below). */
.status-board__count {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-board__card[data-bucket="decision"] .status-board__count {
  color: var(--dsw-alias-state-warn-primary);
}

/* The decision board's readout: number at reading size, unit at caption size,
   on one baseline, over a hairline that closes the section. This is the single
   place the panel spends size on emphasis. Named apart from the nav-row count
   pill below so the two never inherit each other's box model. */
.status-board__readout {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0;
  padding: 1px 6px 4px 15px;
}

.status-board__readout-n {
  color: var(--sb-accent);
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
}

.status-board__readout-u {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.status-board__rule {
  height: 1px;
  margin: 0 6px 3px 15px;
  background: var(--dsw-alias-border-l1);
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

.status-board__rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 1px 0 0;
  /* Indent to the section label's text edge, not to its chevron: the rows read
     as the section's content. */
  padding: 0 0 2px 16px;
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

.status-board__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sb-accent);
}

/* The decision dot is the one row that may need to catch the eye from across
   the screen, so it gets a halo; the others stay quiet. */
.status-board__card[data-bucket="decision"] .status-board__dot {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sb-accent) 20%, transparent);
}

.status-board__row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__row-meta {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Messages ────────────────────────────────────────────────────────────── */

.status-board__empty {
  margin: 0;
  padding: 3px 6px 4px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
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
  padding: 9px 8px 9px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.status-board__overlay-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__overlay-total {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
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
  right: 10px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 8px;
  line-height: 1;
  transform: translateY(-50%);
  transition: transform 120ms ease, color 120ms ease;
}

.status-board__nav-chevron[data-open="true"] {
  color: var(--dsw-alias-state-business-primary);
  transform: translateY(-50%) rotate(90deg);
}

/* ── Inline tree (entry ①) ───────────────────────────────────────────────── */

/* The portal container is inserted after the framework nav row inside
   nav.panelList. It is a normal flex child there, so the tree pushes the
   Workspace browser down instead of floating over it. */
.status-board__tree-portal {
  display: block;
  flex: none;
  margin: 0 2px 4px;
  max-height: min(46vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.status-board__tree-portal[hidden] {
  display: none;
}

.status-board-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-left: 8px;
  padding: 2px 0 4px 9px;
  border-left: 1px solid var(--dsw-alias-border-l1);
}

.status-board-tree__folder {
  --sb-tree-accent: var(--dsw-alias-label-tertiary);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.status-board-tree__folder[data-bucket="decision"] {
  --sb-tree-accent: var(--dsw-alias-state-warn-label);
}

.status-board-tree__folder[data-bucket="executing"] {
  --sb-tree-accent: var(--dsw-alias-state-business-primary);
}

.status-board-tree__heading {
  margin: 0;
  font: inherit;
  font-weight: inherit;
}

.status-board-tree__toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 28px;
  padding: 4px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
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

.status-board-tree__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sb-tree-accent);
}

.status-board-tree__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board-tree__count {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.status-board-tree__rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0 0 2px 14px;
  list-style: none;
}

.status-board-tree__row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 4px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
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

.status-board-tree__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 0;
}

.status-board-tree__title {
  overflow: hidden;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board-tree__time {
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 1.3;
}

.status-board-tree__empty {
  margin: 0;
  padding: 2px 5px 4px 19px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.status-board-tree__truncated {
  margin: 0;
  padding: 1px 5px 3px 19px;
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
  padding: 4px 7px;
  border: 0;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 10.5px;
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
  padding: 2px 0 4px 16px;
}

/* ── Question card (L2) ──────────────────────────────────────────────────── */

.status-board__qcard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__qcall {
  display: flex;
  flex-direction: column;
  gap: 7px;
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
  font-size: 12px;
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
  gap: 3px;
  margin-top: 6px;
}

.status-board__q-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
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
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));
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

.status-board__q-option-desc {
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.4;
}

.status-board__q-custom {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}

.status-board__q-custom-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}

.status-board__q-input {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
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
  gap: 6px;
  margin-top: 7px;
}

.status-board__q-submit {
  padding: 5px 10px;
  border: 0;
  border-radius: 6px;
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
  padding: 5px 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
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
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow:
    0 2px 6px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent),
    0 10px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  cursor: pointer;
  pointer-events: auto;
}

.status-board__fab:hover {
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__fab:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.status-board__fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border: 2px solid var(--dsw-alias-bg-layer-1);
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 9px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.status-board__overlay--fab {
  position: fixed;
  right: 16px;
  bottom: 64px;
  z-index: 61;
  width: min(380px, calc(100vw - 24px));
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
  }

  .status-board__overlay--fab {
    right: 12px;
    bottom: 136px;
    max-height: min(62vh, 520px);
  }
}
`
