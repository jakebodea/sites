/**
 * What a site turns on in its CMS admin, declared once in `apps/<site>/cms.config.ts`.
 * The defaults are deliberately small: branding, a theme, a "Start here" card, and
 * the assistant with the two presets every site benefits from. Sites opt into more.
 */
import type { OptionalNavItem } from "./nav.ts";
import type { AdminTheme } from "./theme.ts";

/** Where a tip's link goes; resolved by the admin (EmDash's Block Kit link targets). */
export type GuideLinkTarget =
  | { readonly kind: "plugin-page"; readonly path: string }
  | { readonly kind: "external"; readonly url: string };

/** One "Start here" tip on the dashboard. */
export interface GuideTip {
  readonly title: string;
  readonly body: string;
  readonly link?: { readonly label: string; readonly target: GuideLinkTarget };
}

/**
 * One-click assistant jobs on an entry's editor panel. Each is a prompt the
 * same MCP-backed agent runs against that entry, so all of them save drafts only.
 */
export type AssistantPreset = "polish" | "seo" | "alt-text" | "translate";

export interface AssistantOptions {
  /**
   * Workers AI text model with tool calling. Kimi K2.5 is the strongest agentic
   * model on Workers AI that does not need paid billing.
   */
  readonly model?: string;
  readonly presets?: readonly AssistantPreset[];
  /** Collections whose edit screen offers the one-click jobs; default: every collection. */
  readonly collections?: readonly string[];
  /** Locales the site publishes, for the `translate` preset, e.g. ["en", "es"]. */
  readonly locales?: readonly string[];
}

export interface CmsAdminOptions {
  /** Short site name shown in the admin sidebar, tab title, and login screen. */
  readonly siteName: string;
  /** Square image (public path) for the sidebar and login; the site's app icon reads best. */
  readonly logo: string;
  readonly favicon: string;
  readonly theme: AdminTheme;
  readonly guide?: readonly GuideTip[];
  /** `false` hides the assistant and the "Connect an assistant" page. */
  readonly assistant?: AssistantOptions | false;
  /**
   * Built-in admin screens the site uses that are hidden by default (comments,
   * bylines, tags, ...), so the client's nav lists only what applies to them.
   */
  readonly nav?: { readonly show?: readonly OptionalNavItem[] };
}

/** EmDash plugin id; also the path segment of the plugin's admin pages and API routes. */
export const SITE_ADMIN_PLUGIN_ID = "site-admin";

export const DEFAULT_ASSISTANT_MODEL = "@cf/moonshotai/kimi-k2.5";
export const DEFAULT_PRESETS: readonly AssistantPreset[] = ["polish", "seo"];

export const DEFAULT_GUIDE: readonly GuideTip[] = [
  {
    body: "Open Pages or the Home page in the sidebar, change the words or photos, then select Save. Visitors see the change after you select Publish.",
    title: "Change a page",
  },
  {
    body: "Every save is a draft until you publish, and earlier versions stay under Revisions, so nothing you try is permanent.",
    title: "You can't break anything",
  },
  {
    body: "Select Assistant in the top bar and describe a change in plain words. On a page's edit screen it also offers one-click jobs for that page. It saves drafts for you to review before anything goes live.",
    title: "Ask the assistant",
  },
];

/** The `admin` option of `emdash()`: the client's name and icon instead of EmDash's. */
export const adminBranding = (options: CmsAdminOptions) => ({
  favicon: options.favicon,
  footerLabel: false as const,
  logo: options.logo,
  siteName: options.siteName,
});

/** Identity for this file's callers; gives `cms.config.ts` type checking and autocomplete. */
export const defineCmsAdmin = (options: CmsAdminOptions): CmsAdminOptions =>
  options;
