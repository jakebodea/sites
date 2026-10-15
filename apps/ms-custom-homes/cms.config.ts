/**
 * How the CMS admin looks and what it offers this client (see
 * `@jakebodea/cloudflare-kit/emdash/admin`). Colors come from `src/styles/global.css`.
 */
import { defineCmsAdmin } from "@jakebodea/cloudflare-kit/emdash/admin";

export const cms = defineCmsAdmin({
  assistant: {
    collections: ["home", "pages", "projects"],
    presets: ["polish", "seo", "alt-text"],
  },
  favicon: "/favicon.png",
  guide: [
    {
      body: "Open Projects, select Add new, add a name, a main photo, and the details, then Save. Select Publish when it should appear on the site.",
      title: "Add a home",
    },
    {
      body: "Open Home page or Pages, change the words or photos, and Save. Every save is a draft until you Publish, and earlier versions stay under Revisions.",
      title: "Change a page",
    },
    {
      body: "Select Assistant in the top bar and describe a change in plain words. It saves drafts for you to review.",
      title: "Ask the assistant",
    },
  ],
  logo: "/icon-512.png",
  siteName: "MS Custom Homes",
  theme: {
    brand: "oklch(0.28 0.03 250)",
    brandHover: "oklch(0.21 0.022 250)",
    brandOnDark: "oklch(0.79 0.045 245)",
    canvas: "oklch(0.982 0.006 85)",
    radius: "0.125rem",
  },
});
