/**
 * How the CMS admin looks and what it offers this client (see
 * `@jakebodea/cloudflare-kit/emdash/admin`). Colors come from `src/styles/global.css`.
 */
import { defineCmsAdmin } from "@jakebodea/cloudflare-kit/emdash/admin";

export const cms = defineCmsAdmin({
  assistant: {
    collections: ["home", "pages", "projects", "categories"],
    presets: ["polish", "seo", "alt-text"],
  },
  favicon: "/favicon.png",
  guide: [
    {
      body: "Open Projects, select Add new, add a name, a main photo, and the details, then Save. Select Publish when it should appear in the portfolio.",
      title: "Add a project",
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
  siteName: "Access Electric",
  theme: {
    brand: "oklch(0.38 0.05 225)",
    brandHover: "oklch(0.24 0.035 230)",
    brandOnDark: "oklch(0.72 0.07 225)",
    canvas: "oklch(0.992 0.002 100)",
  },
});
