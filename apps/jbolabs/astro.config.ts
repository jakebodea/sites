// Built and run only through Alchemy (`alchemy dev` locally, `alchemy deploy` for stages).
// No `adapter`: Alchemy injects its own Cloudflare adapter; `workerEntryAlias` swaps in
// src/worker.ts (crons, preview noindex, PostHog proxy). No CMS: copy lives in src/content.
import { fileURLToPath } from "node:url";

import { distilledCloudflare } from "@alchemy.run/frontend-frameworks/astro/cloudflare";
import react from "@astrojs/react";
import { workerEntryAlias } from "@jakebodea/cloudflare-kit/emdash/alchemy-workarounds";
import {
  WORKER_COMPATIBILITY,
  readBuildInputs,
} from "@jakebodea/cloudflare-kit/infra";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";

const root = import.meta.dirname;
// Written by alchemy.run.ts per stage (the public origin).
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
      cssVariable: "--font-body",
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
      name: "Figtree",
      provider: fontProviders.google(),
      weights: [400, 500, 600],
    },
    {
      // The wordmark's face: bold "jbo", hairline "labs". Headlines borrow both ends.
      cssVariable: "--font-wordmark",
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
      name: "Montserrat",
      provider: fontProviders.google(),
      weights: [200, 300, 700],
    },
    {
      cssVariable: "--font-label",
      fallbacks: ["ui-monospace", "monospace"],
      name: "Geist Mono",
      provider: fontProviders.google(),
      weights: [400],
    },
  ],
  image: { layout: "constrained", responsiveStyles: true },
  integrations: [...standaloneAdapter, react()],
  output: "server",
  site: inputs.origin,
  vite: {
    ...(buildCaches && { cacheDir: buildCaches.vite }),
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        workerEntryAlias(
          fileURLToPath(new URL("src/worker.ts", import.meta.url))
        ),
      ],
    },
    ssr: {
      optimizeDeps: {
        // Server-side Effect code: one pre-bundled chunk each instead of hundreds of modules.
        include: [
          "effect",
          "effect/http",
          "effect/observability",
          "@jakebodea/cloudflare-kit > posthog-node",
        ],
        // A late re-optimization reloads only some modules in workerd's runner, leaving two
        // React copies ("Invalid hook call"). Pre-bundle the list above (plus what the Astro and
        // React integrations add) and never discover more at runtime.
        noDiscovery: true,
      },
    },
  },
});
