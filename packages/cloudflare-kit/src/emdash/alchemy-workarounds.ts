/**
 * EmDash-on-Alchemy workarounds. THIS IS THE ONLY PLACE THEY LIVE.
 *
 * Alchemy's `Cloudflare.Website.Astro` injects its own Cloudflare adapter and
 * pins the Worker entry, but EmDash needs its own entry (cron-driven scheduled
 * publishing, the plugin bridge) and its own `/_image` endpoint (R2 media +
 * the Images binding). These Vite aliases splice EmDash back in. Verified with
 * alchemy / @alchemy.run/frontend-frameworks 2.0.0-beta.80 and emdash 1.1.0;
 * `.github/workflows/upgrade-smoke.yml` rebuilds against the latest releases
 * weekly to catch breakage.
 *
 * Delete this module when Alchemy supports a custom Worker entry and image
 * endpoint for Astro. The related rules that are config, not hacks:
 * - astro config: no `adapter` (Alchemy injects one); keep the default config
 *   filename (Alchemy's `config:` prop double-joins paths).
 * - alchemy.run.ts: bind `IMAGES: Cloudflare.Images.Images("IMAGES")`;
 *   `forceDestroy: true` on non-prod R2 buckets (destroy fails on non-empty buckets).
 * - bunfig.toml: `[install] peer = false` (installing frontend-frameworks hangs on its optional peers).
 */

export interface AliasEntry {
  readonly find: RegExp;
  readonly replacement: string;
}

/**
 * Alchemy pins its own Worker entry; this swaps in the site's `src/worker.ts`.
 * Sites without EmDash use it alone: their entry wraps Alchemy's handler,
 * imported as `@alchemy.run/frontend-frameworks/astro/entrypoints/server.js`
 * (the `.js` spelling escapes this alias), to add crons and response headers.
 */
export const workerEntryAlias = (workerEntry: string): AliasEntry => ({
  find: /^@alchemy\.run\/frontend-frameworks\/astro\/entrypoints\/server$/u,
  replacement: workerEntry,
});

/** Vite `resolve.alias` entries; `workerEntry` is the absolute path of the site's `src/worker.ts`. */
export const emdashOnAlchemyAliases = (workerEntry: string): AliasEntry[] => [
  // 1. Use the site's entry, which wraps EmDash's.
  workerEntryAlias(workerEntry),
  {
    // 2. EmDash's entry wraps the stock adapter handler; hand it Alchemy's vendored copy instead.
    find: /^@astrojs\/cloudflare\/entrypoints\/server$/u,
    replacement: "@alchemy.run/frontend-frameworks/astro/entrypoints/server.js",
  },
  {
    // 3. Alchemy installs a passthrough `/_image` endpoint that EmDash cannot wrap; serve
    //    EmDash's Cloudflare endpoint (reads media from R2, resizes with the IMAGES binding).
    find: /^.*\/image-passthrough-endpoint\.js$/u,
    replacement: "@emdash-cms/cloudflare/image-endpoint",
  },
];
