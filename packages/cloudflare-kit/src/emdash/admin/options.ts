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

/**
 * A skill of the site's own, loaded by the assistant only when a request needs it.
 * The shared skills (editing entries, page sections, photos, copy editing, search
 * descriptions) come with the kit; a site adds what is not on its pages, such
 * as tone preferences or words the client avoids (facts the assistant reads from
 * the pages themselves). A site skill named like a shared one replaces it.
 */
export interface SiteSkill {
  /** Lowercase letters, digits and hyphens, e.g. "house-style". */
  readonly name: string;
  /** When to load it; the assistant sees only this until it does. */
  readonly description: string;
  /** The skill itself, Markdown. */
  readonly instructions: string;
}

export interface AssistantOptions {
  /**
   * Workers AI text model with tool calling and image input (`describe_photo`
   * uses the same model). Default: GLM-5.3-Flash, chosen to fit the daily free
   * neurons; see `DEFAULT_ASSISTANT_MODEL`.
   */
  readonly model?: string;
  readonly presets?: readonly AssistantPreset[];
  /** Collections whose edit screen offers the one-click jobs; default: every collection. */
  readonly collections?: readonly string[];
  /** Locales the site publishes, for the `translate` preset, e.g. ["en", "es"]. */
  readonly locales?: readonly string[];
  readonly skills?: readonly SiteSkill[];
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

/**
 * GLM-5.3-Flash: tool calling, native image input, a 1M-token context, and prompt
 * caching, at about a sixth of Kimi K2.6's neurons per token ($0.15 / $0.03 cached /
 * $0.50 per M input / cached / output). A typical edit turn costs a few hundred
 * neurons, so dozens fit in the 10,000 free each day. Needs Workers Paid or AI
 * Gateway credits. Kimi K2.5, the previous default, is deprecated.
 */
export const DEFAULT_ASSISTANT_MODEL = "@cf/zai-org/glm-5.3-flash";
/**
 * GLM-5.3-Flash thinks at `max` unless told otherwise, and thinking is billed as
 * output; `high` keeps the agentic quality at a fraction of the tokens.
 */
export const ASSISTANT_REASONING = "high";
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
