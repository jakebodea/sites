/**
 * `cmsAdmin(options)`: the Astro half of the admin kit. It injects the site's
 * admin theme and scopes the assistant's plugin routes (see `middleware.ts`).
 * The EmDash half is `adminBranding(options)` and `siteAdminPlugin(options)`.
 */
import type { AstroIntegration } from "astro";

import type { CmsAdminOptions } from "./options.ts";
import { adminThemeCss } from "./theme.ts";

const THEME_MODULE = "virtual:cms-admin-theme";

export const cmsAdmin = (options: CmsAdminOptions): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ addMiddleware, updateConfig }) => {
      const css = adminThemeCss(options.theme);
      addMiddleware({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/admin/middleware",
        order: "post",
      });
      updateConfig({
        vite: {
          plugins: [
            {
              load: (id) =>
                id === `\0${THEME_MODULE}`
                  ? `export default ${JSON.stringify(css)}`
                  : undefined,
              name: "cms-admin-theme",
              resolveId: (id) =>
                id === THEME_MODULE ? `\0${THEME_MODULE}` : undefined,
            },
          ],
        },
      });
    },
  },
  name: "cms-admin",
});
