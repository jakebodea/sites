import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

/** Shared formatter preset, re-exported by the root `oxfmt.config.ts`. */
export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // EmDash generates this from the live schema on every dev-server start.
    "**/emdash-env.d.ts",
    // Upstream sources cloned for agents by scripts/sync-references.ts.
    ".repos/**",
    // Throwaway experiments kept for reference; not part of the template.
    "spikes/**",
  ],
});
