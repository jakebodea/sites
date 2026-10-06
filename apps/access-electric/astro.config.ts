// Built and run only through Alchemy (`alchemy dev` locally, `alchemy deploy` for stages).
// No `adapter`: Alchemy injects its own Cloudflare adapter, and the EmDash entry and image
// endpoint are spliced back in by `emdashOnAlchemyAliases`.
import { fileURLToPath } from "node:url";

import { distilledCloudflare } from "@alchemy.run/frontend-frameworks/astro/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { emdashOnAlchemyAliases } from "@jakebodea/cloudflare-kit/emdash/alchemy-workarounds";
import { analyticsPlugin } from "@jakebodea/cloudflare-kit/emdash/analytics";
import { emailPlugin } from "@jakebodea/cloudflare-kit/emdash/email-plugin";
import { seedMedia } from "@jakebodea/cloudflare-kit/emdash/seed-media";
import {
  WORKER_COMPATIBILITY,
  readBuildInputs,
} from "@jakebodea/cloudflare-kit/infra";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

import { site } from "./site.config.ts";

const root = import.meta.dirname;
// Written by alchemy.run.ts per stage (origin, seed media base, CMS email sender).
const inputs = readBuildInputs(root);

/**
 * `ASTRO_STANDALONE_BUILD=1 astro build` (the `build` script, used by CI) compiles the
 * site with Alchemy's adapter but without Alchemy, so builds need no Cloudflare credentials.
 * Under `alchemy dev` / `alchemy deploy` Alchemy injects the same adapter itself.
 */
const standalone = process.env.ASTRO_STANDALONE_BUILD === "1";
const standaloneAdapter = standalone
  ? [
      distilledCloudflare({
        vite: {
          compatibilityDate: WORKER_COMPATIBILITY.date,
          compatibilityFlags: [...WORKER_COMPATIBILITY.flags],
        },
      }),
    ]
  : [];

/**
 * The standalone build gets its own Astro and Vite caches: sharing them with a running
 * `alchemy dev` rewrites the dev server's optimized deps and font data under it (pages
 * fail with missing optimized chunks or `FontFamilyNotFound` until a restart).
 */
const buildCaches = standalone
  ? { astro: "./node_modules/.astro-build", vite: "node_modules/.vite-build" }
  : undefined;

export default defineConfig({
  ...(buildCaches && { cacheDir: buildCaches.astro }),
  devToolbar: { enabled: false },
  fonts: [
    {
      cssVariable: "--font-display",
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
      name: "Archivo",
      provider: fontProviders.google(),
      weights: [600, 700, 800],
    },
    {
      cssVariable: "--font-body",
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
      name: "Inter",
      provider: fontProviders.google(),
      weights: [400, 500, 600],
    },
  ],
  image: {
    layout: "constrained",
    remotePatterns: [
      {
        hostname: new URL(inputs.origin ?? "http://localhost").hostname,
        pathname: "/_emdash/api/media/file/**",
      },
    ],
    responsiveStyles: true,
  },
  integrations: [
    ...standaloneAdapter,
    seedMedia({ mediaBase: inputs.seedMediaBase }),
    react(),
    emdash({
      database: d1({ binding: "DB", session: "auto" }),
      // CMS mail (invites, magic links) only once a verified sender exists; until then
      // EmDash reports "Email is not configured" and invite links are copied by hand.
      plugins: [
        analyticsPlugin,
        ...(inputs.emailFrom === undefined
          ? []
          : [
              emailPlugin({
                from: {
                  email: inputs.emailFrom,
                  name: inputs.emailFromName ?? site.name,
                },
              }),
            ]),
      ],
      storage: r2({ binding: "MEDIA" }),
    }),
  ],
  output: "server",
  site: inputs.origin,
  vite: {
    ...(buildCaches && { cacheDir: buildCaches.vite }),
    plugins: [tailwindcss()],
    resolve: {
      alias: emdashOnAlchemyAliases(
        fileURLToPath(new URL("src/worker.ts", import.meta.url))
      ),
    },
    ssr: {
      optimizeDeps: {
        // EmDash lazy-imports its own chunks (`await import("./validation-*.mjs")`); bundled into
        // the deps cache those chunk names drift between optimizer runs, so it loads natively.
        exclude: ["emdash"],
        // CommonJS deps EmDash renders with: workerd's dev module runner can't evaluate CJS,
        // so they are pre-bundled to ESM (the stock Cloudflare adapter does this implicitly).
        include: [
          "emdash > sanitize-html",
          "emdash > @emdash-cms/admin > @lingui/core",
          // Server-side Effect code: one pre-bundled chunk each instead of hundreds of modules.
          "effect",
          "effect/http",
          "effect/observability",
        ],
        // A late re-optimization reloads only some modules in workerd's runner, leaving two
        // React copies ("Invalid hook call") or stale chunks. Pre-bundle the list above (plus what
        // the Astro/React/EmDash integrations add) and never discover more at runtime.
        noDiscovery: true,
      },
    },
  },
});
