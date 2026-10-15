/**
 * The SSR dependencies every site pre-bundles for `alchemy dev`. Each entry
 * the optimizer has to discover at runtime costs a re-optimize and a full
 * reload of workerd's module runner; a cold boot found ~15 of them, reloaded
 * nine times, crashed the runtime and came back with two React copies and no
 * font data. With all of them listed, a cold boot optimizes once and serves
 * its first page in ~13 s. When `start` reports a wedged boot, run
 * `DEBUG=vite:deps` and add each "new dependencies found" entry here.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SHARED = [
  // CommonJS deps EmDash renders with: workerd's dev module runner can't evaluate CJS,
  // so they are pre-bundled to ESM (the stock Cloudflare adapter does this implicitly).
  "emdash > sanitize-html",
  "emdash > @emdash-cms/admin > @lingui/core",
  // EmDash's MCP route (called in-process by the CMS assistant) imports CJS content-type/ajv.
  "emdash > @modelcontextprotocol/sdk/server/mcp.js",
  "emdash > @modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  // CMS assistant (cloudflare-kit admin plugin).
  "@jakebodea/cloudflare-kit > @modelcontextprotocol/sdk/client/index.js",
  "@jakebodea/cloudflare-kit > @modelcontextprotocol/sdk/client/streamableHttp.js",
  "@jakebodea/cloudflare-kit > @tanstack/ai",
  "@jakebodea/cloudflare-kit > @tanstack/ai/testing",
  "@jakebodea/cloudflare-kit > @tanstack/ai-cloudflare",
  // Server-side Effect code: one pre-bundled chunk each instead of hundreds of modules.
  "effect",
  "effect/http",
  "effect/observability",
  // Imported by Astro, the Cloudflare adapter and EmDash's runtime entries on the first requests.
  "astro/app/manifest",
  "astro/middleware",
  "astro/logger/console",
  "astro/zod",
  "astro/content/runtime",
  "astro/virtual-modules/live-config",
  "astro/actions/runtime/entrypoints/server.js",
  "@astrojs/cloudflare/image-service-workerd",
  "emdash > @emdash-cms/auth",
  "emdash > @emdash-cms/auth/adapters/kysely",
  "@emdash-cms/cloudflare/db/d1",
  "@emdash-cms/cloudflare/storage/r2",
  "@eisbachcode/emdash-plugin-analytics/sandbox",
];

const SOURCE_FILE = /\.(?:astro|tsx?|mdx?)$/u;
const LUCIDE_ICON = /@lucide\/astro\/icons\/[a-z0-9-]+/gu;

const sourceFiles = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  return files;
};

/** Every `@lucide/astro/icons/<name>` a site's source imports: one entry point per icon. */
export const lucideIconImports = (sourceDirectory: string): string[] => {
  const icons = new Set<string>();
  for (const file of sourceFiles(sourceDirectory)) {
    for (const [icon] of readFileSync(file, "utf-8").matchAll(LUCIDE_ICON)) {
      icons.add(icon);
    }
  }
  return [...icons].toSorted();
};

/** `vite.ssr.optimizeDeps.include` for a site whose source lives in `sourceDirectory`. */
export const ssrPrebundle = (sourceDirectory: string): string[] => [
  ...SHARED,
  ...lucideIconImports(sourceDirectory),
];
