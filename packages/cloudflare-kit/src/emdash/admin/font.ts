import type { AstroUserConfig } from "astro";
/**
 * The one face every CMS admin uses, whatever the public site is set in. EmDash's
 * admin reads `--font-emdash`; sites pass `emdash({ fonts: false })` so EmDash's
 * Noto Sans stays out and add this to Astro's `fonts`. Inter holds up in the
 * admin's dense tables and forms, where a site's display or body face may not.
 */
import { fontProviders } from "astro/config";

export const adminFont = {
  cssVariable: "--font-emdash",
  fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
  name: "Inter",
  provider: fontProviders.google(),
  weights: [400, 500, 600, 700],
} satisfies NonNullable<AstroUserConfig["fonts"]>[number];
