/**
 * Board styles.
 *
 * Visual language borrowed from the Harness chrome rather than invented: 12–13px
 * type, 6–8px radii, flat surfaces, one accent per state. The board is a
 * *popover*, so it carries a raised surface and a shadow; the rows inside it are
 * flush lists, not cards.
 *
 * State colour is the only colour in the file and it always comes from a theme
 * token (`--dsw-alias-state-*`, `--dsw-alias-brand-primary`), so light/dark
 * switching is automatic. Tints are derived with `color-mix` instead of
 * hardcoded rgba, which keeps the token-only rule testable.
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
  border: 1px solid var(--dsw-alias-border-l1);
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
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
}

/* ── Scroll body ─────────────────────────────────────────────────────────── */

.status-board__scroll {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

/* ── Section ─────────────────────────────────────────────────────────────── */

.status-board__card {
  /* Each board owns an accent; everything inside reads it, so one declaration
     per board colours its count pill, its rows' dots, and its rule. */
  --sb-accent: var(--dsw-alias-state-idle-primary);
}

.status-board__card[data-bucket="decision"] {
  --sb-accent: var(--dsw-alias-state-warn-primary);
}

.status-board__card[data-bucket="executing"] {
  --sb-accent: var(--dsw-alias-brand-primary);
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
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  padding: 4px 6px 5px;
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
  outline: 2px solid var(--dsw-alias-brand-primary);
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
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The readout: number at reading size, unit at caption size, baseline-aligned.
   This is the one place the board spends size on emphasis. */
.status-board__readout {
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  align-items: baseline;
  justify-content: flex-end;
  min-width: 0;
}

.status-board__readout-n {
  color: var(--sb-accent);
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1;
}

.status-board__readout-u {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 28px;
  padding: 4px 6px;
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
  outline: 2px solid var(--dsw-alias-brand-primary);
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

/* ── Sidebar-foot readout ────────────────────────────────────────────────── */

/* Option A: the entry is an instrument, not an icon. It sits in the sidebar foot
   and shows the three counts, so the numbers are readable without opening the
   panel. The whole strip is one button. */
.status-board__strip {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.status-board__strip:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
}

.status-board__strip:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

/* Open state reads as "this is the panel's trigger", not as a second hover. */
.status-board__strip[data-open="true"] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-2);
}

.status-board__strip-label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
}

.status-board__strip-text {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__strip-metrics {
  display: flex;
  flex: 0 0 auto;
  gap: 7px;
  align-items: center;
}

.status-board__metric {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-board__metric-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}

.status-board__metric[data-metric="decision"] .status-board__metric-dot {
  background: var(--dsw-alias-state-warn-primary);
}

.status-board__metric[data-metric="decision"] {
  color: var(--dsw-alias-state-warn-primary);
}

.status-board__metric[data-metric="executing"] .status-board__metric-dot {
  background: var(--dsw-alias-brand-primary);
}

/* Compact form, used only when the sidebar is collapsed to its rail. */
.status-board__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.status-board__trigger:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.status-board__trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

.status-board__trigger[data-open="true"] {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary);
}

.status-board__trigger-count {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 15px;
  text-align: center;
}

/* ── Floating board ──────────────────────────────────────────────────────── */

.status-board__overlay-root {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  /* Bottom-aligned: the trigger lives at the sidebar foot, so the board opens
     upward from it instead of appearing far away at the top of the window. */
  align-items: flex-end;
  padding: 44px 0 44px 12px;
}

.status-board__overlay {
  display: flex;
  flex-direction: column;
  width: 304px;
  /* Bounded, not stretched: the panel is as tall as its content until the list
     grows past the viewport. */
  max-height: calc(100vh - 96px);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  /* Opaque on purpose: a translucent board over a conversation is unreadable. */
  background: var(--dsw-alias-bg-layer-1);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent),
    0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
}

.status-board__overlay:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
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
  outline: 2px solid var(--dsw-alias-brand-primary);
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
`