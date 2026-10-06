/**
 * Route discovery from the site's own sitemap, so smoke tests and screenshots
 * cover every published page without a hand-kept list.
 */

import { request } from "./http.ts";

const LOC = /<loc>(?<url>[^<]+)<\/loc>/gu;

/** Every `<loc>` in a sitemap or sitemap index. */
export const sitemapLocations = (xml: string): string[] =>
  [...xml.matchAll(LOC)].flatMap((match) => {
    const url = match.groups?.url?.trim();
    return url === undefined ? [] : [url];
  });

const isSitemap = (url: string): boolean =>
  new URL(url).pathname.endsWith(".xml");

const fetchText = async (url: string): Promise<string> => {
  const response = await request(url);
  return response.ok ? await response.text() : "";
};

/** Same-origin page paths from `/sitemap.xml`, following nested sitemaps one level deep. */
export const discoverPaths = async (origin: string): Promise<string[]> => {
  const top = sitemapLocations(await fetchText(`${origin}/sitemap.xml`));
  const sitemaps: string[] = [];
  const pages: string[] = [];
  for (const url of top) {
    (isSitemap(url) ? sitemaps : pages).push(url);
  }
  const nested = await Promise.all(sitemaps.map(fetchText));
  pages.push(...nested.flatMap(sitemapLocations));
  // Sitemaps carry the configured public origin; map every entry onto the origin under test.
  return [...new Set(pages.map((url) => new URL(url).pathname))].toSorted();
};
