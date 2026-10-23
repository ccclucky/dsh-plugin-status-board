/**
 * Sidebar module styles.
 *
 * The module renders INSIDE the left column, where the shipped workspace
 * browser normally lives, so it must read as part of that chrome rather than as
 * a page: 13px text, 26px rows, 11px section labels, and the sidebar's own fill
 * token.
 *
 * Colour comes exclusively from the Harness theme tokens (`--dsw-alias-*`,
 * `--dsw-specific-sidebar-fill`), so light/dark switching is automatic.
 *
 * The CSS is a string rendered inside the component on purpose: the `<style>`
 * element unmounts with it, so no global stylesheet can outlive the plugin (the
 * Harness exposes no `ctx.styles` service to a static bundle).
 * @module dsh-plugin-status-board/client/styles
 */

/** CSS injected by the module component. */
export const PANEL_CSS = String.raw`
.status-board {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  padding: 4px 8px 8px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-sidebar-fill);
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.4;
}

.status-board__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 6px;
}

.status-board__title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}

.status-board__total {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.status-board__filter {
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 6px;
  padding: 4px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}

.status-board__filter:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}

.status-board__scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.status-board__alert {
  margin: 0 4px 6px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 6px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
}

.status-board__card {
  border-radius: 6px;
}

.status-board__heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.status-board__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
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
  transition: transform 120ms ease;
}

.status-board__chevron[data-collapsed="true"] {
  transform: rotate(-90deg);
}

.status-board__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__count {
  flex: 0 0 auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}

.status-board__rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 1px 0 4px 14px;
  list-style: none;
}

.status-board__row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 26px;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

/* Only an actual button advertises itself as clickable. */
button.status-board__row {
  cursor: pointer;
}

button.status-board__row:hover {
  background: var(--dsw-alias-bg-layer-2);
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
  background: var(--dsw-alias-state-idle-primary);
}

.status-board__dot[data-state="decision"] {
  background: var(--dsw-alias-state-warn-primary);
}

.status-board__dot[data-state="executing"] {
  background: var(--dsw-alias-brand-primary);
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
  max-width: 45%;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__empty {
  margin: 0;
  padding: 2px 6px 6px 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.status-board__truncated {
  margin: 0;
  padding: 0 6px 4px 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .status-board__chevron {
    transition: none;
  }
}

/* ── Floating board (option C) ─────────────────────────────────────────────
   The trigger sits at the sidebar foot beside Settings; the board floats in the
   frame-wide overlay layer. Both read as Harness chrome, not as an app window. */

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
  min-width: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-bg-layer-1);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.status-board__overlay-root {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  /* Anchored to the sidebar's width, so the board opens beside the trigger
     rather than floating detached in the middle of the window. */
  padding: 44px 0 44px 12px;
}

.status-board__overlay {
  display: flex;
  flex-direction: column;
  width: 300px;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  /* Opaque on purpose: a translucent board over a conversation is unreadable.
     The shadow is derived from a theme token rather than a hardcoded black, so
     it inverts correctly in dark mode and keeps the token-only colour rule. */
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 24%, transparent);
}

.status-board__overlay:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

.status-board__overlay-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 6px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.status-board__overlay-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
}

.status-board__overlay-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
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

/* The board inside the overlay is a panel, not a sidebar column: it already
   sits on an opaque surface, so it drops the sidebar fill it would inherit. */
.status-board__overlay-body .status-board {
  height: auto;
  background: transparent;
}
`