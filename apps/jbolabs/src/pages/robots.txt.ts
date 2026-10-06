import type { APIRoute } from "astro";

// Previews stay out of search through the Worker's X-Robots-Tag header, not here:
// a Disallow would stop crawlers from ever seeing that noindex.
// oxlint-disable-next-line sonarjs/function-name -- Astro endpoints must export HTTP verbs by name.
export const GET: APIRoute = ({ site, url }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${site?.origin ?? url.origin}/sitemap.xml\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } }
  );
