import { defineMiddleware } from "astro/middleware";
import themeCss from "virtual:cms-admin-theme";

import { injectAdminTheme } from "./theme.ts";

const ADMIN_SHELL = "/_emdash/admin";

export const onRequest = defineMiddleware(async (context, render) => {
  const response = await render();
  const html = response.headers.get("content-type")?.includes("text/html");
  if (!context.url.pathname.startsWith(ADMIN_SHELL) || html !== true) {
    return response;
  }
  // The admin shell is one small HTML document (a React SPA mounts into it).
  return new Response(injectAdminTheme(await response.text(), themeCss), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
});
