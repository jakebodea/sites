import type { AstroIntegration } from "astro";

import { OWNER_BOOTSTRAP_PATH } from "./owner-policy.ts";

export const siteOwner = (): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ addMiddleware, injectRoute }) => {
      injectRoute({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/owner-route",
        pattern: OWNER_BOOTSTRAP_PATH,
        prerender: false,
      });
      addMiddleware({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/owner-middleware",
        order: "post",
      });
    },
  },
  name: "studio-cms-owner",
});
