/**
 * Board styles.
 *
 * Colour comes exclusively from the Harness theme tokens (`--dsw-alias-*`), so
 * the panel follows light/dark switching and survives a token rename with a
 * degraded-but-readable appearance. Sizes follow the Harness chrome rather than
 * inventing a scale: 13px rows, 12px meta, 8px dot, 6px radius.
 *
 * The CSS is a string rather than an imported stylesheet on purpose: a
 * plugin-owned `<style>` element unmounts with the component, so no global
 * stylesheet can outlive the panel (see the Client plugin guidance).
 * @module dsh-plugin-status-board/client/styles
 */

/** CSS injected by the panel component. */
export const PANEL_CSS = String.raw`
.status-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  height: 100%;
  padding: 20px 24px 28px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.45;
}

.status-board__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
}

.status-board__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.status-board__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.status-board__subtitle {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.status-board__total {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.status-board__alert {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}

.status-board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}

.status-board__card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}

.status-board__card[data-bucket="decision"] {
  border-left: 3px solid var(--dsw-alias-state-warn-primary);
}

.status-board__card[data-bucket="executing"] {
  border-left: 3px solid var(--dsw-alias-brand-primary);
}

.status-board__card[data-bucket="recent"] {
  border-left: 3px solid var(--dsw-alias-state-idle-primary);
}

.status-board__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.status-board__toggle:hover {
  background: var(--dsw-alias-bg-layer-2);
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
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-board__count {
  flex: 0 0 auto;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  text-align: center;
}

.status-board__hint {
  margin: 0;
  padding: 0 12px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.status-board__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 8px 8px;
  list-style: none;
}

.status-board__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
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
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}

.status-board__row[data-state="decision"] .status-board__dot {
  background: var(--dsw-alias-state-warn-primary);
}

.status-board__row[data-state="executing"] .status-board__dot {
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
  padding: 4px 12px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.status-board__truncated {
  margin: 0;
  padding: 0 12px 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

@media (max-width: 720px) {
  .status-board {
    padding: 16px;
  }

  .status-board__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-board__chevron {
    transition: none;
  }
}
`