import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { writeBuildInputs } from "@jakebodea/cloudflare-kit/infra";
import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";

import { seedStage } from "../../packages/control-app/src/seed.ts";
import { controlCheck } from "./control-check.ts";
import { localWorker } from "./local-worker.ts";

const SiteList = Schema.fromJsonString(Schema.Array(Schema.String));
const SiteConfig = Schema.Struct({
  site: Schema.Struct({
    localSeedMediaBase: Schema.optionalKey(Schema.NonEmptyString),
  }),
});
const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, ".artifacts/ci/local-seo");
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
      seedMediaBase: config.site.localSeedMediaBase,
    });
    continue;
  }
  mkdirSync(output, { recursive: true });
  let worker: Awaited<ReturnType<typeof localWorker>> | undefined;
  try {
    worker = await localWorker(directory, cms);
    if (cms) {
      const seed = await seedStage(worker.origin);
      writeFileSync(
        path.join(output, `${site}-seed.json`),
        `${JSON.stringify(seed, null, 2)}\n`
      );
      if (!seed.seeded) {
        throw new Error(`${site}: ${seed.detail}`);
      }
    }
    const passed = await controlCheck({
      flags: ["--content-only"],
      name: "seo",
      origin: worker.origin,
      output,
      site,
    });
    failed ||= !passed;
  } catch (error) {
    failed = true;
    const detail = String(error);
    writeFileSync(
      path.join(output, `${site}-error.json`),
      `${JSON.stringify({ error: detail }, null, 2)}\n`
    );
    process.stderr.write(`${site}: local SEO failed: ${detail}\n`);
  } finally {
    await worker?.runtime.dispose();
  }
}
process.exitCode = failed ? 1 : 0;
