/**
 * Teardown-only stack for the two pre-PR previews. Loading the current app stack
 * would unnecessarily require new CMS secrets and build inputs during deletion.
 * Alchemy deletes the resources recorded in this existing stack/stage's state.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { RandomProvider } from "alchemy/Random";
import { Effect, Layer } from "effect";

import { retirementSite } from "./retirement-policy.ts";

const site = process.env.RETIRE_SITE ?? "";

export default Alchemy.Stack(
  site,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), RandomProvider()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* retirement() {
    retirementSite(site, yield* Alchemy.Stage);
    return {};
  })
);
