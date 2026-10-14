/**
 * The site's languages. English is served unprefixed at `/`, Spanish under
 * `/es/` (Astro i18n with `prefixDefaultLocale: false`, see astro.config.ts).
 */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (value: string | undefined): value is Locale =>
  value === "en" || value === "es";

/** `Astro.currentLocale` narrowed to a supported locale. */
export const toLocale = (value: string | undefined): Locale =>
  isLocale(value) ? value : DEFAULT_LOCALE;

/** BCP 47 tag for `<html lang>` and `og:locale`. */
export const LANGUAGE_TAG: Record<Locale, string> = {
  en: "en-US",
  es: "es-US",
};

/** Prefixes a site path with the locale segment (`/about` -> `/es/about`). */
export const localePath = (locale: Locale, path: string): string => {
  if (locale === DEFAULT_LOCALE) {
    return path;
  }
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
};

/**
 * Routes that live in code rather than the CMS, keyed by locale. The
 * language switcher and the application links use these.
 */
export const APPLY_PATH: Record<Locale, string> = {
  en: "/apply",
  es: "/es/solicitar",
};
