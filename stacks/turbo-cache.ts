/**
 * Turborepo remote cache hosted on Cloudflare (Worker + R2), shared by CI and
 * every agent worktree. The bearer token is minted by Alchemy and written to
 * GitHub as `TURBO_TOKEN` (secret) with `TURBO_API` / `TURBO_TEAM`
 * (variables), so CI picks the cache up with no manual setup.
 *
 *   ALCHEMY_PROFILE=admin bun alchemy deploy stacks/turbo-cache.ts --stage shared
 *
 * Local use: copy the `turboApi`/`turboTeam` outputs and the token (shown
 * once with `bun alchemy state` for this stage) into the main checkout's `.env`.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Random, RandomProvider } from "alchemy/Random";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect, Layer } from "effect";

import { repository } from "./config.ts";

const TEAM = "marketing";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export default Alchemy.Stack(
  "turbo-cache",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      GitHub.providers(),
      RandomProvider()
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* turboCache() {
    const artifacts = yield* Cloudflare.R2.Bucket("Artifacts", {
      // Cache entries are disposable; expire them so the bucket does not grow forever.
      lifecycleRules: [
        {
          deleteObjectsTransition: {
            condition: { maxAge: CACHE_TTL_SECONDS, type: "Age" },
          },
          enabled: true,
          id: "expire-artifacts",
        },
      ],
    }).pipe(RemovalPolicy.retain());
    const token = yield* Random("TurboToken", { bytes: 32 }).pipe(
      RemovalPolicy.retain()
    );
    const worker = yield* Cloudflare.Worker("TurboCache", {
      env: { ARTIFACTS: artifacts, TURBO_TOKEN: token.text },
      main: new URL("turbo-cache/worker.ts", import.meta.url).pathname,
      name: "turbo-cache",
    });
    const { owner } = repository;
    const repo = repository.repository;
    yield* GitHub.Secret("TurboToken", {
      name: "TURBO_TOKEN",
      owner,
      repository: repo,
      value: token.text,
    });
    yield* GitHub.Variable("TurboApi", {
      name: "TURBO_API",
      owner,
      repository: repo,
      value: worker.url.as<string>(),
    });
    yield* GitHub.Variable("TurboTeam", {
      name: "TURBO_TEAM",
      owner,
      repository: repo,
      value: TEAM,
    });
    return { turboApi: worker.url.as<string>(), turboTeam: TEAM };
  })
);
