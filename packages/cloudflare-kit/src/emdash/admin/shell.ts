/**
 * The admin's shared look: rounded, airy, few lines. Every site gets it; a site's
 * `AdminTheme` only adds its brand color and canvas on top.
 *
 * Most of it is Kumo tokens (radius, line, hairline, fill). The rest needs selectors,
 * and each one hangs on something Kumo or EmDash ships as a hook, not on layout classes:
 * - `[data-sidebar-wrapper]`, `[data-sidebar=…]`: Kumo's Sidebar parts. Kumo has an
 *   `inset` variant, but EmDash renders `variant="sidebar"`, so the inset frame (sidebar
 *   on a tinted canvas, the page in a rounded card) is drawn here on desktop. The page
 *   column is the wrapper's only `div` after the `aside`.
 * - `.ring-kumo-fill`: Kumo's token utility on the inner surface of a layer card. Cards
 *   read as surfaces with a soft shadow instead of a second ring.
 * - `[data-testid=dashboard-metric]`: EmDash's dashboard stat cards.
 * If an EmDash upgrade drops a hook, that rule stops matching and the admin falls back
 * to Kumo's default look for that part; nothing breaks.
 */

const LIGHT = "html[data-theme]:not([data-mode=dark])";
const DARK = "html[data-theme][data-mode=dark]";
/** The left nav's wrapper; the entry editor's settings panel is a second, right-side Sidebar. */
const SHELL = "html[data-theme] [data-sidebar-wrapper][data-side=left]";
const PAGE = `${SHELL} > aside + div`;

/** Kumo's mobile breakpoint: below it the sidebar is an off-canvas drawer. */
const DESKTOP = "(min-width: 768px)";

export const ADMIN_SHELL_CSS = `
${LIGHT}, ${DARK} {
  --radius-sm: 0.5rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-xl: 1.25rem;
  --color-kumo-hairline: transparent;
}
${LIGHT} {
  --admin-shell: color-mix(in oklch, var(--color-kumo-elevated), black 3.5%);
  --admin-page: var(--color-kumo-elevated);
  --admin-raised: var(--color-kumo-base);
  --admin-active: color-mix(in oklch, var(--admin-shell), var(--text-color-kumo-default) 6%);
  --color-kumo-line: oklch(0.2 0.01 85 / 0.07);
  --color-kumo-fill: oklch(0.2 0.01 85 / 0.06);
  --admin-card-shadow: 0 0 0 1px oklch(0 0 0 / 0.035), 0 1px 2px oklch(0 0 0 / 0.04);
}
${DARK} {
  /* Kumo's dark surfaces are near black, so the page card lifts instead of the canvas sinking. */
  --admin-shell: var(--color-kumo-elevated);
  --admin-page: color-mix(in oklch, var(--color-kumo-elevated), white 6%);
  --admin-raised: color-mix(in oklch, var(--color-kumo-elevated), white 10%);
  --admin-active: color-mix(in oklch, var(--admin-shell), var(--text-color-kumo-default) 12%);
  --color-kumo-line: oklch(1 0 0 / 0.08);
  --color-kumo-fill: oklch(1 0 0 / 0.07);
  --admin-card-shadow: 0 0 0 1px oklch(1 0 0 / 0.06);
}
html[data-theme] .ring-kumo-fill {
  --tw-ring-color: transparent;
  box-shadow: var(--admin-card-shadow);
}
${SHELL} > aside [data-sidebar=content] * {
  border-color: transparent;
}
html[data-theme] [data-testid=dashboard-metric] > div:first-child {
  padding-bottom: 0.25rem;
}
@media ${DESKTOP} {
  ${SHELL} {
    --sidebar-bg: var(--admin-shell);
    --sidebar-active-bg: var(--admin-active);
    background: var(--admin-shell);
  }
  ${SHELL} :is([data-sidebar=content-container], [data-sidebar=header], [data-sidebar=footer]) {
    border-color: transparent;
  }
  ${PAGE} {
    /* Surfaces inside the card follow it (the editor form; cards one step up); both resolved on <html>. */
    --color-kumo-elevated: var(--admin-page);
    --color-kumo-base: var(--admin-raised);
    margin: 0.5rem 0.5rem 0.5rem 0;
    border-radius: 1rem;
    background: var(--admin-page);
    box-shadow: var(--admin-card-shadow);
  }
  ${PAGE} > :is(header, main) {
    background: transparent;
    border-color: transparent;
  }
  ${PAGE} > main {
    padding: 2rem 2.5rem;
  }
}`;
