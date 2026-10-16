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
 * - `.ring-kumo-hairline:has(> .ring-kumo-fill)`: Kumo's layer card, an outer frame (title)
 *   around an inner surface, matched by its token utilities. The frame becomes the one card,
 *   title inside, and the inner surface blends into it.
 * - `[data-testid=admin-version]`: the version stamp in the sidebar footer.
 * - `main thead`, `main div:has(> table)`, `main footer`: EmDash's list tables and sticky
 *   page footers, by element rather than class.
 * - `#admin-root > astro-island > div`: the sign-in and setup screens have no hooks, so
 *   they are matched by shape (logo before the heading, the card after it).
 * If an EmDash upgrade drops a hook, that rule stops matching and the admin falls back
 * to Kumo's default look for that part; nothing breaks.
 */

const LIGHT = "html[data-theme]:not([data-mode=dark])";
const DARK = "html[data-theme][data-mode=dark]";
/** The left nav's wrapper; the entry editor's settings panel is a second, right-side Sidebar. */
const SHELL = "html[data-theme] [data-sidebar-wrapper][data-side=left]";
const PAGE = `${SHELL} > aside + div`;
/** Screens outside the sidebar layout: sign-in, invite, setup, and the loading screen. */
const BARE =
  "html[data-theme] #admin-root > astro-island > div:not([data-sidebar-wrapper])";

/** Kumo's mobile breakpoint: below it the sidebar is an off-canvas drawer. */
const DESKTOP = "(min-width: 768px)";

export const ADMIN_SHELL_CSS = `
${LIGHT}, ${DARK} {
  --radius-sm: 0.5rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-xl: 1.25rem;
}
${LIGHT} {
  --admin-shell: color-mix(in oklch, var(--color-kumo-elevated), black 3.5%);
  --admin-page: var(--color-kumo-elevated);
  --admin-raised: var(--color-kumo-base);
  --admin-active: color-mix(in oklch, var(--admin-shell), var(--text-color-kumo-default) 6%);
  --color-kumo-line: oklch(0.2 0.01 85 / 0.07);
  /* Faint, never transparent: an unchecked Kumo checkbox is drawn only by this ring. */
  --color-kumo-hairline: oklch(0.2 0.01 85 / 0.14);
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
  --color-kumo-hairline: oklch(1 0 0 / 0.16);
  --color-kumo-fill: oklch(1 0 0 / 0.07);
  --admin-card-shadow: 0 0 0 1px oklch(1 0 0 / 0.06);
}
html[data-theme] .ring-kumo-hairline:has(> .ring-kumo-fill) {
  --tw-ring-color: transparent;
  background: var(--color-kumo-base);
  box-shadow: var(--admin-card-shadow);
}
html[data-theme] .ring-kumo-hairline:has(> .ring-kumo-fill) > :not(.ring-kumo-fill) {
  margin-block: 0;
  padding-bottom: 0;
  background: transparent;
  color: var(--text-color-kumo-subtle);
  font-size: 0.875rem;
}
html[data-theme] .ring-kumo-hairline > .ring-kumo-fill {
  --tw-ring-color: transparent;
  background: transparent;
}
${SHELL} > aside [data-sidebar=content] * {
  border-color: transparent;
}
/* EmDash's build stamp in the sidebar footer means nothing to a client; footerLabel: false only drops the label beside it. */
html[data-theme] [data-testid=admin-version] {
  display: none;
}
/* Tables: a flat, quiet header row and the same soft edge as cards instead of a border. */
html[data-theme] main thead > tr {
  background: transparent;
}
html[data-theme] main thead th {
  color: var(--text-color-kumo-subtle);
  font-size: 0.8125rem;
  font-weight: 500;
}
html[data-theme] main div:has(> table) {
  border-color: transparent;
  box-shadow: var(--admin-card-shadow);
}
/* The entry editor's settings panel: a rounded card beside the form, not a bordered column. */
html[data-theme] [data-sidebar-wrapper][data-side=right] > aside [data-sidebar=content-container] {
  border-color: transparent;
  border-radius: var(--radius-xl);
  box-shadow: var(--admin-card-shadow);
}
${BARE} {
  background: var(--admin-shell);
}
${BARE} img:has(+ h1) {
  height: 3.5rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--admin-card-shadow);
}
${BARE} div:has(> h1) + div {
  padding: 2rem;
  border-color: transparent;
  border-radius: var(--radius-xl);
  box-shadow: var(--admin-card-shadow), 0 8px 24px oklch(0 0 0 / 0.04);
}
${BARE} .uppercase {
  text-transform: none;
}
@media ${DESKTOP} {
  ${SHELL} {
    background: var(--admin-shell);
  }
  /* On the aside, not the wrapper: EmDash sets --sidebar-bg inline on the wrapper. */
  ${SHELL} > aside {
    --sidebar-bg: var(--admin-shell);
    --sidebar-active-bg: var(--admin-active);
  }
  /* The current page is a raised pill in the page's own color; hover keeps Kumo's tint. */
  ${SHELL} [data-sidebar=menu-button][data-active=true] {
    background: var(--admin-page);
    box-shadow: var(--admin-card-shadow);
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
    padding: 1.5rem 2.5rem;
  }
  /* Sticky footers (media pagination) bleed to the card edge by Kumo's 1.5rem; match the wider gutter. */
  ${PAGE} > main footer {
    margin-inline: -2.5rem;
    padding-inline: 2.5rem;
  }
}`;

/**
 * EmDash's own mark (its 75x75 logo SVG) shows in dialogs such as the first-sign-in welcome;
 * the site's logo takes its place.
 */
export const adminLogoCss = (logo: string): string => `
html[data-theme] [role=dialog] svg[viewBox="0 0 75 75"] {
  display: none;
}
html[data-theme] [role=dialog] :has(> svg[viewBox="0 0 75 75"])::before {
  content: "";
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: url(${JSON.stringify(logo)}) center / cover;
  box-shadow: var(--admin-card-shadow);
}`;
