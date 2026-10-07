/**
 * Deploys sites to one stage from CI and reports their URLs.
 *
 *   bun scripts/ci/deploy.ts --stage pr-42 --sites '["access-electric"]'
 *   bun scripts/ci/deploy.ts --stage pr-42 --destroy --sites all
 *
 * Writes `deployments.json` ([{ site, url }]) for later steps (smoke, comment).
 * Production deploys are refused outside CI by each site's stack.
 */
import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";
import pLimit from "p-limit";

import { migrateDatabase } from "./migrate.ts";

const SiteList = Schema.fromJsonString(Schema.Array(Schema.String));
const URL_OUTPUT = /url:\s*'(?<url>https?:\/\/[^']+)'/u;
const DATABASE_OUTPUT = /databaseId:\s*'(?<id>[0-9a-f-]{36})'/u;

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const root = path.resolve(import.meta.dirname, "../..");
const stage = flag("--stage") ?? "";
const destroy = process.argv.includes("--destroy");
const requested = flag("--sites") ?? "all";
const sites =
  requested === "all"
    ? listSites(root)
    : Schema.decodeUnknownSync(SiteList)(requested);

if (!/^[a-z][a-z0-9-]{0,30}$/u.test(stage)) {
  throw new Error(`Invalid --stage "${stage}"`);
}
if (destroy && stage === "prod") {
  throw new Error("Refusing to destroy prod from CI.");
}

// GitHub expands an unset secret or variable to "", which would read as a
// configured-but-empty setting (an API token of "" provisions a feature and
// fails auth). Drop empty values so optional settings stay unset.
const deployEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== "")
);

const execute = promisify(
  (
    args: readonly string[],
    directory: string,
    done: (
      error: Error | null,
      output: { stderr: string; stdout: string }
    ) => void
  ): void => {
    execFile(
      "bun",
      args,
      {
        cwd: directory,
        encoding: "utf-8",
        env: deployEnv,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          process.stdout.write(stdout);
          process.stderr.write(stderr);
        }
        done(error, { stderr, stdout });
      }
    );
  }
);
const parallel = stage.startsWith("pr-") && !destroy && sites.length > 1;
// Site state is separate, but the account-wide state-store service upgrades in place.
if (parallel) {
  const { stdout, stderr } = await execute(
    ["alchemy", "provider", "cloudflare", "bootstrap"],
    root
  );
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}
// Keep production and destruction serial.
const concurrency = pLimit(parallel ? 3 : 1);
const deploySite = async (site: string) => {
  const started = performance.now();
  const directory = path.join(root, "apps", site);
  const { stdout: output, stderr } = await execute(
    [
      "alchemy",
      destroy ? "destroy" : "deploy",
      "--stage",
      stage,
      "--yes",
      "--no-input",
    ],
    directory
  );
  process.stdout.write(output);
  process.stderr.write(stderr);
  if (!destroy && existsSync(path.join(directory, "seed/seed.json"))) {
    const databaseId = DATABASE_OUTPUT.exec(output)?.groups?.id;
    if (databaseId === undefined) {
      throw new Error(`${site}: deploy reported no databaseId`);
    }
    migrateDatabase(directory, databaseId, deployEnv);
  }
  process.stdout.write(
    `${site}: deployment and migration finished in ${((performance.now() - started) / 1000).toFixed(1)}s\n`
  );
  return { site, url: URL_OUTPUT.exec(output)?.groups?.url ?? null };
};
// Await every active stack before reporting failure; do not abandon an in-flight deployment.
const results = await Promise.allSettled(
  sites.map(
    async (site) => await concurrency(async () => await deploySite(site))
  )
);
const failures: unknown[] = [];
for (const result of results) {
  if (result.status === "rejected") {
    failures.push(result.reason);
  }
}
if (failures.length > 0) {
  throw new AggregateError(failures, "Site deployment failed");
}
const deployments = results.flatMap((result) =>
  result.status === "fulfilled" ? [result.value] : []
);

writeFileSync(
  path.join(root, "deployments.json"),
  `${JSON.stringify(deployments, null, 2)}\n`
);
