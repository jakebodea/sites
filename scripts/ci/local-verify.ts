import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { writeBuildInputs } from "@jakebodea/cloudflare-kit/infra";
import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";

import { seedStage } from "../../packages/control-app/src/seed.ts";
import { controlCheck } from "./control-check.ts";
import { lighthouse } from "./lighthouse.ts";
import { LOCAL_CMS_BOOTSTRAP_TOKEN, localWorker } from "./local-worker.ts";

const SiteList = Schema.fromJsonString(Schema.Array(Schema.String));
const SiteConfig = Schema.Struct({
  site: Schema.Struct({
    localSeedMediaBase: Schema.optionalKey(Schema.NonEmptyString),
  }),
});
const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, ".artifacts/ci/local-verification");
const index = process.argv.indexOf("--sites");
const sites = Schema.decodeUnknownSync(SiteList)(
  index === -1 ? "[]" : process.argv[index + 1]
);
const known = listSites(root);
const prepare = process.argv.includes("--prepare");
let failed = false;

for (const site of sites) {
  if (!known.includes(site)) {
    throw new Error(`Unknown site: ${site}`);
  }
  const directory = path.join(root, "apps", site);
  const cms = existsSync(path.join(directory, "seed/seed.json"));
  if (prepare) {
    const config = Schema.decodeUnknownSync(SiteConfig)(
      await import(path.join(directory, "site.config.ts"))
    );
    if (cms && config.site.localSeedMediaBase === undefined) {
      throw new Error(
        `${site}: localSeedMediaBase is required to audit seeded media`
      );
    }
    writeBuildInputs(directory, {
      contentDigest: "seed",
      seedMediaBase: config.site.localSeedMediaBase,
    });
  }
}

// Keep one Miniflare lifecycle in this process: concurrent fresh CMS bootstraps
// can stall migrations. Local seeding is cheap; Lighthouse needs serial CPU anyway.
if (!prepare) {
  for (const site of sites) {
    const directory = path.join(root, "apps", site);
    const cms = existsSync(path.join(directory, "seed/seed.json"));
    mkdirSync(output, { recursive: true });
    const started = performance.now();
    process.stdout.write(`${site}: starting required verification\n`);
    let worker: Awaited<ReturnType<typeof localWorker>> | undefined;
    try {
      worker = await localWorker(directory, cms);
      if (cms) {
        const seed = await seedStage(worker.origin, LOCAL_CMS_BOOTSTRAP_TOKEN);
        writeFileSync(
          path.join(output, `${site}-seed.json`),
          `${JSON.stringify(seed, null, 2)}\n`
        );
        if (!seed.seeded) {
          throw new Error(`${site}: ${seed.detail}`);
        }
      }
      const { origin } = worker;
      const checks = await Promise.all([
        controlCheck({ name: "smoke", origin, output, site }),
        controlCheck({
          flags: ["--content-only"],
          name: "seo",
          origin,
          output,
          site,
        }),
      ]);
      if (checks.includes(false)) {
        failed = true;
        continue;
      }
      await lighthouse(origin, path.join(output, site, "lighthouse"));
    } catch (error) {
      failed = true;
      const detail = String(error);
      writeFileSync(
        path.join(output, `${site}-error.json`),
        `${JSON.stringify({ error: detail }, null, 2)}\n`
      );
      process.stderr.write(`${site}: local verification failed: ${detail}\n`);
    } finally {
      await worker?.runtime.dispose();
      process.stdout.write(
        `${site}: required verification finished in ${((performance.now() - started) / 1000).toFixed(1)}s\n`
      );
    }
  }
}
process.exitCode = failed ? 1 : 0;
