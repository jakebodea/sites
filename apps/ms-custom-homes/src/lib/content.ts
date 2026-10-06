import { Option, Schema } from "effect";
/**
 * Content queries for pages. Every function returns plain data plus the
 * EmDash cache hints, so routes can register them with `Astro.cache`.
 */
import {
  getEmDashCollection,
  getEmDashEntry,
  getMenuWithCacheHint,
  getSiteSettingsWithCacheHint,
} from "emdash";
import type { CacheHint } from "emdash";

import type { Project } from "../../emdash-env";

export type MediaImage = NonNullable<Project["featured_image"]>;

export interface NavItem {
  readonly label: string;
  readonly url: string;
}

export interface SiteChrome {
  readonly title: string;
  readonly tagline: string;
  readonly primary: readonly NavItem[];
  readonly footer: readonly NavItem[];
  /** First link of the `announcement` menu, shown as a bar above the header. */
  readonly announcement: NavItem | undefined;
  readonly cacheHints: readonly CacheHint[];
}

const menuItems = (menu: { items: { label: string; url: string }[] } | null) =>
  (menu?.items ?? []).map(({ label, url }) => ({ label, url }));

export const getSiteChrome = async (
  fallbackTitle: string
): Promise<SiteChrome> => {
  const [settings, primary, footer, announcement] = await Promise.all([
    getSiteSettingsWithCacheHint(),
    getMenuWithCacheHint("primary"),
    getMenuWithCacheHint("footer"),
    getMenuWithCacheHint("announcement"),
  ]);
  return {
    announcement: menuItems(announcement.data)[0],
    cacheHints: [
      settings.cacheHint,
      primary.cacheHint,
      footer.cacheHint,
      announcement.cacheHint,
    ],
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

export const getProject = async (slug: string) =>
  await getEmDashEntry("projects", slug);

/** Every published project, in the editor's chosen order. */
export const getProjects = async () =>
  await getEmDashCollection("projects", {
    orderBy: { sort_order: "asc" },
  });

/** Projects marked "Show on the home page" (EmDash cannot filter on booleans, so this filters in memory). */
export const getFeaturedProjects = async () => {
  const all = await getProjects();
  return {
    cacheHint: all.cacheHint,
    entries: all.entries.filter((entry) => entry.data.featured === true),
  };
};

export const PROJECT_TYPES = {
  bath: "Bath",
  custom_home: "Custom home",
  kitchen: "Kitchen",
  outdoor: "Outdoor living",
  remodel: "Remodel",
} as const satisfies Record<Project["project_type"], string>;

/** External links (the financing partner) open in a new tab. */
export const isExternal = (url: string) => /^https?:\/\//u.test(url);

export const projectFacts = (
  project: Project
): { label: string; value: string }[] =>
  [
    { label: "Type", value: PROJECT_TYPES[project.project_type] },
    {
      label: "Status",
      value:
        project.progress === "in_progress" ? "Under construction" : "Completed",
    },
    { label: "Location", value: project.location },
  ].flatMap(({ label, value }) =>
    // EmDash returns `null` for unset fields at runtime, whatever the generated type says.
    Option.match(
      Schema.decodeUnknownOption(Schema.Trim.check(Schema.isMinLength(1)))(
        value
      ),
      {
        onNone: () => [],
        onSome: (text) => [{ label, value: text }],
      }
    )
  );

export type { Project } from "../../emdash-env";
