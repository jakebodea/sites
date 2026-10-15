/**
 * The `site-admin` EmDash plugin: a "Start here" dashboard card and the
 * "Connect an assistant" page (Block Kit), plus the bundle that puts the Assistant
 * in the top bar (`client/`). The assistant itself streams from its own route
 * (`chat-route.ts`), since plugin routes answer with buffered JSON.
 */
import { Option } from "effect";
import type { PluginDescriptor, RouteContext } from "emdash";
import { definePlugin } from "emdash";

import { decodeInteraction } from "./interactions.ts";
import { DEFAULT_GUIDE, SITE_ADMIN_PLUGIN_ID } from "./options.ts";
import type { CmsAdminOptions } from "./options.ts";
import { connectorsPage, startHereWidget } from "./ui.ts";

const VERSION = "1.1.0";

/** Plugin options travel through EmDash's virtual module, so they are plain JSON. */
export type SiteAdminPluginOptions = Pick<CmsAdminOptions, "guide"> & {
  readonly assistant: boolean;
};

/** Entry point EmDash's integration bundles; use {@link siteAdminPlugin} in astro config. */
export const createPlugin = (options: SiteAdminPluginOptions) => {
  // oxlint-disable-next-line require-await -- the screens are built synchronously; EmDash still awaits the handler.
  const admin = async (ctx: RouteContext) => {
    const interaction = Option.getOrUndefined(decodeInteraction(ctx.input));
    return interaction?.page === "widget:start"
      ? startHereWidget(options.guide ?? DEFAULT_GUIDE)
      : connectorsPage(new URL(ctx.request.url).origin);
  };
  return definePlugin({
    admin: {
      pages: options.assistant
        ? [{ icon: "plug", label: "Connect an assistant", path: "/claude" }]
        : [],
      widgets: [{ id: "start", size: "full", title: "Start here" }],
    },
    id: SITE_ADMIN_PLUGIN_ID,
    routes: { admin: { handler: admin, permission: "plugins:read" } },
    version: VERSION,
  });
};

export default createPlugin;

/** Descriptor for `emdash({ plugins: [siteAdminPlugin(cmsAdmin)] })`. */
export const siteAdminPlugin = (options: CmsAdminOptions): PluginDescriptor => {
  const assistant = options.assistant !== false;
  const pluginOptions: SiteAdminPluginOptions = {
    assistant,
    guide: options.guide ?? DEFAULT_GUIDE,
  };
  return {
    ...(assistant && {
      adminEntry: "@jakebodea/cloudflare-kit/emdash/admin/client",
    }),
    entrypoint: "@jakebodea/cloudflare-kit/emdash/admin/plugin",
    format: "native",
    id: SITE_ADMIN_PLUGIN_ID,
    options: pluginOptions,
    version: VERSION,
  };
};
