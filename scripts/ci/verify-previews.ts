/**
 * After a CI deploy: smoke-test every deployed site, run the technical SEO
 * audit (errors fail; on production it catches a stray noindex), and hold
 * previews to the Lighthouse budgets in `lighthouserc.json` (which skips `is-crawlable`:
 * previews send `X-Robots-Tag: noindex` on purpose, and the SEO audit polices that). Reads `deployments.json` from
 * `scripts/ci/deploy.ts`; results land in `.artifacts/ci/`.
 *
 *   bun scripts/ci/verify-previews.ts               # previews
 *   bun scripts/ci/verify-previews.ts --production  # no Lighthouse: never fail on its noise
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import pLimit from "p-limit";

import { command } from "./command.ts";
import { controlCheck } from "./control-check.ts";
import { lighthouse } from "./lighthouse.ts";

const Deployments = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({ site: Schema.String, url: Schema.NullOr(Schema.String) })
  )
);
const root = path.resolve(import.meta.dirname, "../..");
const production = process.argv.includes("--production");
const output = path.join(root, ".artifacts", "ci");
mkdirSync(output, { recursive: true });

const deployments = Schema.decodeUnknownSync(Deployments)(
  readFileSync(path.join(root, "deployments.json"), "utf-8")
);

const sites = pLimit(3);
// Concurrent browser audits compete for CPU and change the performance scores.
const browser = pLimit(1);
const results = await Promise.all(
  deployments.map(
    async ({ site, url }) =>
      await sites(async () => {
        const started = performance.now();
        try {
          if (url === null) {
            throw new Error("deploy reported no URL");
          }
          // A fresh CMS stage serves no pages until setup applies its seed. Seeding skips any
          // stage whose setup already started, so it never overwrites a client's edits.
          await command(
            "bun",
            [
              "packages/control-app/src/cli.ts",
              "seed",
              "--site",
              site,
              "--url",
              url,
            ],
            root
          );
          const checks = await Promise.all([
            controlCheck({ name: "smoke", origin: url, output, site }),
            controlCheck({ name: "seo", origin: url, output, site }),
          ]);
          if (checks.includes(false)) {
            return false;
          }
          if (!production) {
            await browser(async () => {
              await lighthouse(url, path.join(output, site, "lighthouse"));
            });
          }
          return true;
        } catch (error) {
          process.stderr.write(
            `${site}: verification failed: ${String(error)}\n`
          );
          return false;
        } finally {
          process.stdout.write(
            `${site}: verification finished in ${((performance.now() - started) / 1000).toFixed(1)}s\n`
          );
        }
      })
  )
);
process.exitCode = results.includes(false) ? 1 : 0;
