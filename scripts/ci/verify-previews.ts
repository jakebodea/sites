/**
 * After a CI deploy: smoke-test every deployed site, run the technical SEO
 * audit (errors fail; on production it catches a stray noindex), and hold
 * previews to the Lighthouse budgets in `lighthouserc.json` (which skips `is-crawlable`:
 * previews send `X-Robots-Tag: noindex` on purpose, and the SEO audit polices that). Reads `deployments.json` from
 * `scripts/ci/deploy.ts`; results land in `.artifacts/ci/`.
 *
 *   bun scripts/ci/verify-previews.ts               # previews
 *   bun scripts/ci/verify-previews.ts --production  # smoke only, never fail on Lighthouse noise
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const Deployments = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({ site: Schema.String, url: Schema.NullOr(Schema.String) })
  )
);
/** Pages held to the performance budgets: the landing page and the conversion page. */
const BUDGET_PATHS = ["/", "/contact"];

const root = path.resolve(import.meta.dirname, "../..");
const production = process.argv.includes("--production");
const output = path.join(root, ".artifacts", "ci");
mkdirSync(output, { recursive: true });

const deployments = Schema.decodeUnknownSync(Deployments)(
  readFileSync(path.join(root, "deployments.json"), "utf-8")
);

/** Runs one control-app check, saving its JSON report. Returns false when it fails. */
const check = (name: string, site: string, url: string): boolean => {
  try {
    const report = execFileSync(
      "bun",
      ["packages/control-app/src/cli.ts", name, "--site", site, "--url", url],
      { cwd: root, encoding: "utf-8" }
    );
    writeFileSync(path.join(output, `${site}-${name}.json`), report);
    return true;
  } catch (error) {
    process.stderr.write(`${site}: ${name} failed\n${String(error)}\n`);
    return false;
  }
};

let failed = false;
for (const { site, url } of deployments) {
  if (url === null) {
    process.stderr.write(`${site}: deploy reported no URL\n`);
    failed = true;
    continue;
  }
  if (!production) {
    // Previews boot empty; apply the seed (the admin account stays unclaimed) so there is a site to test.
    execFileSync(
      "bun",
      ["packages/control-app/src/cli.ts", "seed", "--site", site, "--url", url],
      { cwd: root, stdio: "inherit" }
    );
  }
  const passed = [check("smoke", site, url), check("seo", site, url)];
  if (passed.includes(false)) {
    failed = true;
  }
  if (!production) {
    // `autorun` reads a space-separated `--collect.url <url>` as the boolean `true`.
    const urls = BUDGET_PATHS.map((route) => `--collect.url=${url}${route}`);
    try {
      execFileSync("bunx", ["@lhci/cli@0.15.1", "autorun", ...urls], {
        cwd: root,
        stdio: "inherit",
      });
    } catch {
      process.stderr.write(`${site}: Lighthouse budgets not met\n`);
      failed = true;
    }
  }
}
process.exitCode = failed ? 1 : 0;
