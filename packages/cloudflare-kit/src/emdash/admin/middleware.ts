import { defineMiddleware } from "astro/middleware";
import config from "virtual:cms-admin-config";
import themeCss from "virtual:cms-admin-theme";

import { brandAdminCopy, injectAdminTheme } from "./theme.ts";

const ADMIN_SHELL = "/_emdash/admin";

export const onRequest = defineMiddleware(async (context, render) => {
  const response = await render();
  const html = response.headers.get("content-type")?.includes("text/html");
  if (!context.url.pathname.startsWith(ADMIN_SHELL) || html !== true) {
    return response;
  }
  // The admin shell is one small HTML document (a React SPA mounts into it).
  const branded = brandAdminCopy(await response.text(), config.siteName);
  return new Response(injectAdminTheme(branded, themeCss), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
});
