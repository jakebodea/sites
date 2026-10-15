/**
 * How the CMS admin looks and what it offers this client (see
 * `@jakebodea/cloudflare-kit/emdash/admin`). Colors come from `src/styles/global.css`.
 */
import { defineCmsAdmin } from "@jakebodea/cloudflare-kit/emdash/admin";

import { LOCALES } from "./src/i18n/locales.ts";

export const cms = defineCmsAdmin({
  assistant: {
    collections: ["home", "pages", "site_text"],
    locales: [...LOCALES],
    presets: ["polish", "seo", "translate", "alt-text"],
  },
  favicon: "/favicon.png",
  guide: [
    {
      body: "Open Home page or Pages, change the words, and Save. Every save is a draft until you Publish, and earlier versions stay under Revisions.",
      title: "Change a page",
    },
    {
      body: "Each page has an English and a Spanish version. After changing one, open its Assistant panel and select Translate to draft the other.",
      title: "Keep both languages in step",
    },
    {
      body: "New applications from the website appear under Applications.",
      title: "See applications",
    },
  ],
  logo: "/icon-512.png",
  siteName: "EquityFast",
  theme: {
    brand: "oklch(0.29 0.126 268.5)",
    brandHover: "oklch(0.24 0.14 269)",
    brandOnDark: "oklch(0.72 0.099 233)",
  },
});
