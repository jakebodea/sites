/**
 * `cmsAdmin(options)`: the Astro half of the admin kit. It injects the site's
 * admin theme, adds the assistant's streaming route, and hands the site's
 * options to that route and the admin bundle through `virtual:cms-admin-config`.
 * The EmDash half is `adminBranding(options)` and `siteAdminPlugin(options)`.
 */
import type { AstroIntegration } from "astro";

import { CHAT_PATH } from "./assistant/protocol.ts";
import { adminNavCss } from "./nav.ts";
import type { CmsAdminOptions } from "./options.ts";
import { ADMIN_SHELL_CSS, adminLogoCss } from "./shell.ts";
import { adminThemeCss } from "./theme.ts";

const virtualModule = (name: string, source: () => string) => ({
  load: (id: string) => (id === `\0${name}` ? source() : undefined),
  name,
  resolveId: (id: string) => (id === name ? `\0${name}` : undefined),
});

export const cmsAdmin = (options: CmsAdminOptions): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ addMiddleware, injectRoute, updateConfig }) => {
      // The shared shell first, so a site's canvas and brand land on top of it.
      const css = `${ADMIN_SHELL_CSS}\n${adminLogoCss(options.logo)}\n${adminNavCss(options.nav?.show)}\n${adminThemeCss(options.theme)}`;
      // Logos, favicons and the theme stay out: the route and the panel need only these.
      const config = {
        assistant: options.assistant ?? {},
        siteName: options.siteName,
      };
      addMiddleware({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/admin/middleware",
        order: "post",
      });
      if (options.assistant !== false) {
        injectRoute({
          entrypoint: "@jakebodea/cloudflare-kit/emdash/admin/chat-route",
          pattern: CHAT_PATH,
          prerender: false,
        });
      }
      updateConfig({
        vite: {
          plugins: [
            virtualModule(
              "virtual:cms-admin-theme",
              () => `export default ${JSON.stringify(css)}`
            ),
            virtualModule(
              "virtual:cms-admin-config",
              () => `export default ${JSON.stringify(config)}`
            ),
          ],
        },
      });
    },
  },
  name: "cms-admin",
});
