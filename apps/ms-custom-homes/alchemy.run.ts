import {
  BUILD_INPUTS_FILE,
  TURNSTILE_TEST_KEYS,
  WORKER_COMPATIBILITY,
  devPort,
  productionDeployRefusal,
  resolveStage,
  webAnalytics,
  leadMail,
  emdashSecrets,
  siteObservability,
  siteSecrets,
  writeBuildInputs,
} from "@jakebodea/cloudflare-kit/infra";
/**
 * MS Custom Homes infrastructure (one Alchemy stack, one stage per environment):
 *
 *   D1 (EmDash content) + R2 (media) + Images binding + session KV (auto)
 *   + Turnstile widget + every-minute cron (EmDash scheduled publishing)
 *   prod only: custom domain, retained backups bucket + daily backup cron
 *
 * Deploy: `bun alchemy deploy --stage <stage> --profile <profile>` from this
 * directory (see .agents/skills/deploy). Never export CLOUDFLARE_* variables.
 */
import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import { RandomProvider } from "alchemy/Random";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect, Layer } from "effect";

import { studio } from "../../stacks/config.ts";
import { site } from "./site.config.ts";
import { BACKUP_CRON, EMDASH_CRON } from "./src/lib/schedule.ts";

const root = import.meta.dirname;

export default Alchemy.Stack(
  site.id,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), RandomProvider()),
    secrets: siteSecrets(root),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const stage = resolveStage(site, yield* Alchemy.Stage);
    const refusal = productionDeployRefusal(stage, process.env);
    if (refusal !== undefined) {
      return yield* Effect.die(new Error(refusal));
    }
    const keep = RemovalPolicy.retain(stage.production);
    // `alchemy dev` emulates D1/R2/KV/Images locally; nothing here may need the cloud.
    const { dev } = yield* AlchemyContext;
    const port = devPort(stage.stage);
    const origin = dev ? `http://localhost:${port}` : stage.origin;

    // Build inputs the Astro config reads (origin, seed media, CMS email sender).
    const emailFrom = studio.sender;
    writeBuildInputs(root, {
      emailFrom,
      emailFromName: `${site.shortName} website`,
      origin,
      // EmDash's SSRF guard refuses localhost seed downloads, so local dev seeds from a public copy.
      seedMediaBase: dev ? site.localSeedMediaBase : `${origin}/_seed/media`,
    });

    const database = yield* Cloudflare.D1.Database("Content").pipe(keep);
    const media = yield* Cloudflare.R2.Bucket("Media", {
      // Disposable stages must empty the bucket to delete it.
      forceDestroy: !stage.production,
    }).pipe(keep);
    // Bound everywhere so the Worker's types never branch; only prod runs the backup cron.
    const backups = yield* Cloudflare.R2.Bucket("Backups", {
      forceDestroy: !stage.production,
    }).pipe(keep);
    // Turnstile has no local emulation: dev uses Cloudflare's always-pass test keys.
    const turnstile = dev
      ? {
          secret: TURNSTILE_TEST_KEYS.secretKey,
          sitekey: TURNSTILE_TEST_KEYS.siteKey,
        }
      : yield* Cloudflare.Turnstile.Widget("Turnstile", {
          domains: [new URL(stage.origin).hostname],
          mode: "managed",
          name: stage.workerName,
        });
    const bindings = {
      ...(yield* webAnalytics(stage)),
      ...leadMail(stage, {
        alertInbox: studio.alertInbox,
        emailFrom,
        fromName: `${site.name} website`,
        inbox: site.leadInbox,
      }),
      ...(yield* emdashSecrets),
      BACKUPS: backups,
      DB: database,
      // EmDash's /_image endpoint resizes media with this binding.
      IMAGES: Cloudflare.Images.Images("IMAGES"),
      MEDIA: media,
      SITE_ORIGIN: origin,
      STAGE: stage.stage,
      TURNSTILE_SECRET_KEY: turnstile.secret,
      TURNSTILE_SITE_KEY: turnstile.sitekey,
    };
    // Cloudflare Email Service needs a verified sender; until then mail is logged, not sent.
    const env =
      emailFrom === undefined
        ? bindings
        : {
            ...bindings,
            EMAIL: Cloudflare.Email.SendEmail("Email", {
              allowedSenderAddresses: [emailFrom],
            }),
          };

    const website = yield* Cloudflare.Website.Astro("Website", {
      compatibility: {
        date: WORKER_COMPATIBILITY.date,
        flags: [...WORKER_COMPATIBILITY.flags],
      },
      crons: stage.production ? [EMDASH_CRON, BACKUP_CRON] : [EMDASH_CRON],
      dev: { port, strictPort: true },
      domain: stage.domain,
      env,
      memo: {
        // Hash the app, the lockfile, workspace packages it imports (auto), and the
        // gitignored build-inputs stamp so per-stage inputs trigger a rebuild.
        exclude: [
          "node_modules/**",
          "dist/**",
          ".astro/**",
          ".alchemy/**",
          ".wrangler/**",
          ".emdash/**",
          "public/_seed/**",
        ],
        include: ["**/*", BUILD_INPUTS_FILE],
        lockfile: true,
      },
      name: stage.workerName,
      observability: siteObservability(stage),
    });

    return {
      databaseId: database.databaseId,
      stage: stage.stage,
      url: website.url,
    };
  })
);
