import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

/** EmDash content: entries, schema, users, settings. */
export const Database = Cloudflare.D1.Database("Database");

/** EmDash media library uploads. */
export const Media = Cloudflare.R2.Bucket("Media");

export const Website = Cloudflare.Website.Astro("Website", {
  compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
  // EmDash publishes scheduled entries from the Worker's scheduled() handler.
  crons: ["* * * * *"],
  env: {
    DB: Database,
    MEDIA: Media,
    // Image resizing for EmDash media (/_image).
    IMAGES: Cloudflare.Images.Images("IMAGES"),
  },
});

export default Alchemy.Stack(
  "EmdashSpike",
  {
    providers: Cloudflare.providers(),
    // Spike only: local state so nothing is written to the Cloudflare state store.
    state: State.localState(),
  },
  Effect.gen(function* () {
    const website = yield* Website;
    return { url: website.url.as<string>() };
  }),
);
