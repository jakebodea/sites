/**
 * Data for the CMS routes, shared by the English and Spanish page files
 * (Astro i18n needs a file per locale prefix). Returns `null` when the
 * entry does not exist, so the page can rewrite to the 404.
 */
import type { AstroGlobal } from "astro";
import { decodeSlug, getSeoMeta } from "emdash";

import { site } from "../../site.config.ts";
import { localePath, toLocale } from "../i18n/locales.ts";
import type { Locale } from "../i18n/locales.ts";
import { getAlternates, getHomePage, getPage } from "./content.ts";

const cache = (
  astro: AstroGlobal,
  hint: Parameters<NonNullable<AstroGlobal["cache"]>["set"]>[0]
) => {
  if (astro.cache?.enabled) {
    astro.cache.set(hint);
  }
};

export const loadHome = async (astro: AstroGlobal) => {
  const locale: Locale = toLocale(astro.currentLocale);
  const { cacheHint, entry: page } = await getHomePage(locale);
  if (!page) {
    return null;
  }
  cache(astro, cacheHint);
  const seo = getSeoMeta(page, {
    defaultDescription: page.data.intro ?? site.description,
    path: localePath(locale, "/"),
    siteUrl: astro.url.origin,
  });
  return { alternates: await getAlternates("home", page.data.id), page, seo };
};

export const loadPage = async (astro: AstroGlobal) => {
  const locale: Locale = toLocale(astro.currentLocale);
  const slug = decodeSlug(astro.params.slug) ?? "";
  if (slug === "") {
    return null;
  }
  const { cacheHint, entry: page } = await getPage(slug, locale);
  if (!page) {
    return null;
  }
  cache(astro, cacheHint);
  const path = localePath(locale, `/${slug}`);
  const seo = getSeoMeta(page, {
    defaultDescription: page.data.intro,
    path,
    siteUrl: astro.url.origin,
  });
  const crumbs = [
    {
      label: locale === "es" ? "Inicio" : "Home",
      path: localePath(locale, "/"),
    },
    { label: page.data.title, path },
  ];
  return {
    alternates: await getAlternates("pages", page.data.id),
    crumbs,
    page,
    seo,
  };
};

export type HomeData = NonNullable<Awaited<ReturnType<typeof loadHome>>>;
export type PageData = NonNullable<Awaited<ReturnType<typeof loadPage>>>;
