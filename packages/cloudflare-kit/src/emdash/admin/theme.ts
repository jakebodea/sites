/**
 * Per-site admin theme. EmDash's admin is built on Kumo's semantic CSS tokens,
 * so restyling means overriding a dozen variables, not any component markup:
 * an EmDash upgrade keeps working as long as the token names hold.
 *
 * Colors are any CSS color (hex, `oklch()`, ...); copy them from the site's `global.css`.
 */
export interface AdminTheme {
  /** Primary buttons, active nav, toggles. Needs white text contrast (a site's `--primary`). */
  readonly brand: string;
  /** Hover state for `brand`; usually the site's deeper shade. */
  readonly brandHover: string;
  /** Brand color on dark backgrounds (dark mode); a lighter tint of `brand`. */
  readonly brandOnDark: string;
  /** Page background behind cards in light mode (the site's `--background`). */
  readonly canvas?: string;
  /** Corner radius scale, e.g. "0.5rem" (the site's `--radius`). */
  readonly radius?: string;
}

/**
 * Kumo's classic theme sets light-mode surfaces on `[data-theme=classic]:not([data-mode=dark])`
 * (specificity 0,2,0); prefixing `html` keeps these overrides ahead without `!important`.
 */
const LIGHT = "html[data-theme]:not([data-mode=dark])";
const DARK = "html[data-theme][data-mode=dark]";

type Declarations = [name: string, value: string][];

const block = (selector: string, declarations: Declarations): string => {
  const body = declarations
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `${selector}{${body}}`;
};

const radii = (radius: string): Declarations => [
  ["--radius-lg", radius],
  ["--radius-md", `calc(${radius} * 0.75)`],
  ["--radius-sm", `calc(${radius} * 0.5)`],
  ["--radius-xl", `calc(${radius} * 1.5)`],
];

/** The stylesheet injected into the admin shell for one site. */
export const adminThemeCss = (theme: AdminTheme): string => {
  const light: Declarations = [
    ["--color-kumo-brand", theme.brand],
    ["--color-kumo-brand-hover", theme.brandHover],
    ["--text-color-kumo-brand", theme.brand],
    ["--text-color-kumo-link", theme.brand],
  ];
  const dark: Declarations = [
    ["--color-kumo-brand", theme.brandOnDark],
    ["--color-kumo-brand-hover", theme.brand],
    ["--text-color-kumo-brand", theme.brandOnDark],
    ["--text-color-kumo-link", theme.brandOnDark],
  ];
  if (theme.canvas !== undefined) {
    light.push(
      ["--color-kumo-canvas", theme.canvas],
      ["--color-kumo-elevated", theme.canvas]
    );
  }
  if (theme.radius !== undefined) {
    light.push(...radii(theme.radius));
    dark.push(...radii(theme.radius));
  }
  return [block(LIGHT, light), block(DARK, dark)].join("\n");
};

/** Inserts the theme `<style>` just before `</head>`; other HTML passes through untouched. */
export const injectAdminTheme = (html: string, css: string): string => {
  const head = html.indexOf("</head>");
  return head === -1
    ? html
    : `${html.slice(0, head)}<style id="site-admin-theme">${css}</style>${html.slice(head)}`;
};
