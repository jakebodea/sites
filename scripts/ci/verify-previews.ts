/**
 * After a CI deploy: smoke-test every deployed site, run the technical SEO
 * audit (errors fail; on production it catches a stray noindex). Lighthouse
 * budgets already run in the required per-site verification jobs. Reads `deployments.json` from
 * `scripts/ci/deploy.ts`; results land in `.artifacts/ci/`.
 *
 *   bun scripts/ci/verify-previews.ts               # previews
 *   bun scripts/ci/verify-previews.ts --production  # same hosted checks
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import pLimit from "p-limit";

import { command } from "./command.ts";
import { controlCheck } from "./control-check.ts";
import { waitForDeployment } from "./readiness.ts";

const Deployments = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({ site: Schema.String, url: Schema.NullOr(Schema.String) })
  )
);
const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, ".artifacts", "ci");
mkdirSync(output, { recursive: true });

const deployments = Schema.decodeUnknownSync(Deployments)(
  readFileSync(path.join(root, "deployments.json"), "utf-8")
);

const sites = pLimit(3);
const results = await Promise.all(
  deployments.map(
    async ({ site, url }) =>
      await sites(async () => {
        const started = performance.now();
        try {
          if (url === null) {
            throw new Error("deploy reported no URL");
          }
          // New custom domains may not resolve immediately after Alchemy attaches them.
          await waitForDeployment(url);
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
          return !checks.includes(false);
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
