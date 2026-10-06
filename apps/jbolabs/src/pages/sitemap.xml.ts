import type { APIRoute } from "astro";

import { ROUTES } from "@/lib/routes";

// oxlint-disable-next-line sonarjs/function-name -- Astro endpoints must export HTTP verbs by name.
export const GET: APIRoute = ({ site, url }) => {
  const origin = site?.origin ?? url.origin;
  const entries = ROUTES.map(
    (route) => `  <url><loc>${origin}${route}</loc></url>`
  ).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } }
  );
};
