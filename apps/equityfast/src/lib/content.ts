/**
 * Content queries for pages. Every function takes the page's locale and
 * returns plain data plus the EmDash cache hints, so routes can register
 * them with `Astro.cache`.
 */
import {
  getEmDashEntry,
  getMenuWithCacheHint,
  getSiteSettingsWithCacheHint,
  getTranslations,
} from "emdash";
import type { CacheHint } from "emdash";

import type { Home, Page } from "../../emdash-env";
import { LOCALES, localePath } from "../i18n/locales.ts";
import type { Locale } from "../i18n/locales.ts";

export type MediaImage = NonNullable<
  Extract<NonNullable<Page["content"]>[number], { _type: "page_hero" }>["image"]
>;

/** Blocks from either page collection; both allow the same block types. */
export type ContentBlock =
  | NonNullable<Home["content"]>[number]
  | NonNullable<Page["content"]>[number];

export interface NavItem {
  readonly label: string;
  readonly url: string;
}

export interface SiteChrome {
  readonly title: string;
  readonly tagline: string;
  readonly primary: readonly NavItem[];
  readonly footer: readonly NavItem[];
  /** Footer disclosure paragraphs, edited in the CMS per language. */
  readonly disclosure: readonly string[];
  readonly cacheHints: readonly CacheHint[];
}

const menuItems = (menu: { items: { label: string; url: string }[] } | null) =>
  (menu?.items ?? []).map(({ label, url }) => ({ label, url }));

/** Splits CMS text on blank lines, dropping empty paragraphs. */
export const paragraphs = (text: string | null | undefined): string[] =>
  (text ?? "")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");

export const getSiteChrome = async (
  locale: Locale,
  fallbackTitle: string
): Promise<SiteChrome> => {
  const [settings, primary, footer, text] = await Promise.all([
    getSiteSettingsWithCacheHint(),
    getMenuWithCacheHint("primary", { locale }),
    getMenuWithCacheHint("footer", { locale }),
    getEmDashEntry("site_text", "site", { locale }),
  ]);
  return {
    cacheHints: [
      settings.cacheHint,
      primary.cacheHint,
      footer.cacheHint,
      text.cacheHint,
    ],
    disclosure: paragraphs(text.entry?.data.disclosure),
    footer: menuItems(footer.data),
    primary: menuItems(primary.data),
    tagline: settings.data.tagline ?? "",
    title: settings.data.title ?? fallbackTitle,
  };
};

export const getPage = async (slug: string, locale: Locale) =>
  await getEmDashEntry("pages", slug, { locale });

/** The home page lives in its own `home` collection (URL pattern `/`) so the sitemap lists `/`. */
export const getHomePage = async (locale: Locale) =>
  await getEmDashEntry("home", "home", { locale });

/** Where the language switcher sends a visitor: the same page in each other language. */
export type Alternates = Partial<Record<Locale, string>>;

/**
 * Paths of every published translation of a CMS entry, by locale. EmDash
 * emits the matching hreflang tags itself; this feeds the visible switcher.
 */
export const getAlternates = async (
  collection: "home" | "pages",
  id: string
): Promise<Alternates> => {
  const { translations } = await getTranslations(collection, id);
  const alternates: Alternates = {};
  for (const translation of translations) {
    const locale = LOCALES.find(
      (candidate) => candidate === translation.locale
    );
    if (locale === undefined || translation.status !== "published") {
      continue;
    }
    if (collection === "home") {
      alternates[locale] = localePath(locale, "/");
    } else if (translation.slug !== null) {
      alternates[locale] = localePath(locale, `/${translation.slug}`);
    }
  }
  return alternates;
};
