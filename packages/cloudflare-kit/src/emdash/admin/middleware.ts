import { defineMiddleware } from "astro/middleware";
import themeCss from "virtual:cms-admin-theme";

import { SITE_ADMIN_PLUGIN_ID } from "./options.ts";
import { runInRequestScope } from "./request-scope.ts";
import { injectAdminTheme } from "./theme.ts";

const ADMIN_SHELL = "/_emdash/admin";
/** The plugin's admin routes, and its editor panel (EmDash serves those under the entry). */
const ASSISTANT_ROUTE = new RegExp(
  `^/_emdash/api/(?:plugins/${SITE_ADMIN_PLUGIN_ID}/|content/[^/]+/[^/]+/plugin-extensions/${SITE_ADMIN_PLUGIN_ID}/)`,
  "u"
);

export const onRequest = defineMiddleware(async (context, render) => {
  const { pathname } = context.url;
  if (ASSISTANT_ROUTE.test(pathname)) {
    return await runInRequestScope(context, async () => await render());
  }
  const response = await render();
  const html = response.headers.get("content-type")?.includes("text/html");
  if (!pathname.startsWith(ADMIN_SHELL) || html !== true) {
    return response;
  }
  // The admin shell is one small HTML document (a React SPA mounts into it).
  return new Response(injectAdminTheme(await response.text(), themeCss), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
});
