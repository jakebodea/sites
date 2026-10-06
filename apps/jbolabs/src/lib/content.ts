/**
 * Content queries for pages. Every function returns plain data plus the
 * EmDash cache hints, so routes can register them with `Astro.cache`.
 */
import {
  getEmDashEntry,
  getMenuWithCacheHint,
  getSiteSettingsWithCacheHint,
} from "emdash";
import type { CacheHint } from "emdash";

export interface NavItem {
  readonly label: string;
  readonly url: string;
}

export interface SiteChrome {
  readonly title: string;
  readonly tagline: string;
  readonly primary: readonly NavItem[];
  readonly footer: readonly NavItem[];
  readonly cacheHints: readonly CacheHint[];
}

const menuItems = (menu: { items: { label: string; url: string }[] } | null) =>
  (menu?.items ?? []).map(({ label, url }) => ({ label, url }));

export const getSiteChrome = async (
  fallbackTitle: string
): Promise<SiteChrome> => {
  const [settings, primary, footer] = await Promise.all([
    getSiteSettingsWithCacheHint(),
    getMenuWithCacheHint("primary"),
    getMenuWithCacheHint("footer"),
  ]);
  return {
    cacheHints: [settings.cacheHint, primary.cacheHint, footer.cacheHint],
    footer: menuItems(footer.data),
    primary: menuItems(primary.data),
    tagline: settings.data.tagline ?? "",
    title: settings.data.title ?? fallbackTitle,
  };
};

export const getPage = async (slug: string) =>
  await getEmDashEntry("pages", slug);

/** The home page lives in its own `home` collection (URL pattern `/`) so the sitemap lists `/`. */
export const getHomePage = async () => await getEmDashEntry("home", "home");
