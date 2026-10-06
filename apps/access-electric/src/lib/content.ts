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

/** Synthetic category for projects marked In progress (not stored in the CMS). */
export const CURRENT_PROJECTS = {
  description: "Work under construction right now.",
  slug: "current-projects",
  title: "Current projects",
} as const;

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

export const getProject = async (slug: string) =>
  await getEmDashEntry("projects", slug, { references: { categories: true } });

export const getCategory = async (slug: string) =>
  await getEmDashEntry("categories", slug, {
    references: { projects: { limit: 100 } },
  });

export const getCurrentProjects = async () =>
  await getEmDashCollection("projects", {
    orderBy: { title: "asc" },
    where: { progress: "in_progress" },
  });

export interface CategorySummary {
  readonly slug: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly cover: MediaImage | undefined;
  readonly count: number;
}

/** Categories in display order, each with its project count and cover photo. */
export const getCategorySummaries = async (): Promise<{
  categories: CategorySummary[];
  cacheHints: CacheHint[];
}> => {
  const list = await getEmDashCollection("categories", {
    orderBy: { sort_order: "asc" },
  });
  const detailed = await Promise.all(
    list.entries.map(async (entry) => await getCategory(entry.id))
  );
  const categories = detailed.flatMap(({ entry }) => {
    if (!entry) {
      return [];
    }
    const projects = entry.references?.projects.entries ?? [];
    return [
      {
        count: projects.length,
        cover: entry.data.cover_image ?? projects[0]?.data.featured_image,
        description: entry.data.description,
        slug: entry.id,
        title: entry.data.title,
      },
    ];
  });
  return {
    cacheHints: [list.cacheHint, ...detailed.map((result) => result.cacheHint)],
    categories,
  };
};

export const projectFacts = (
  project: Project
): { label: string; value: string }[] =>
  [
    { label: "General contractor", value: project.general_contractor },
    { label: "Architect", value: project.architect },
    { label: "Location", value: project.location },
    { label: "Size", value: project.size },
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

export type { Category, Project } from "../../emdash-env";
