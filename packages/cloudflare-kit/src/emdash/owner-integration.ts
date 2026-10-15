import type { AstroIntegration } from "astro";

import { ADMIN_ALIAS } from "./admin-alias.ts";
import { OWNER_BOOTSTRAP_PATH } from "./owner-policy.ts";

export const siteOwner = (): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ addMiddleware, injectRoute }) => {
      injectRoute({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/owner-route",
        pattern: OWNER_BOOTSTRAP_PATH,
        prerender: false,
      });
      injectRoute({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/admin-alias-route",
        pattern: `${ADMIN_ALIAS}/[...path]`,
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
