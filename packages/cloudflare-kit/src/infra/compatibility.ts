/**
 * Workers runtime settings every site deploys with, shared by `alchemy.run.ts`
 * (deployed and `alchemy dev` stages) and the credential-free standalone build
 * in `astro.config.ts`, so the two never drift.
 *
 * `global_fetch_strictly_public`: without it, a Worker's `fetch()` to a hostname
 * on its own zone skips the Worker and goes to the zone's origin, and
 * `workers.dev` has none, so it answers 404. EmDash setup downloads seed images
 * from the stage's own `/_seed/media`; without the flag every deployed stage
 * seeded with no images at all.
 */
export const WORKER_COMPATIBILITY = {
  date: "2026-09-01",
  flags: ["nodejs_compat", "global_fetch_strictly_public"],
} as const;
