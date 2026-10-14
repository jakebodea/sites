import { APPLY_PATH, toLocale } from "../i18n/locales.ts";

/** The apply page for the locale Astro is rendering (`/apply` or `/es/solicitar`). */
export const applyHref = (currentLocale: string | undefined): string =>
  APPLY_PATH[toLocale(currentLocale)];
