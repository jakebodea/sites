/**
 * Deploys sites to one stage from CI and reports their URLs.
 *
 *   bun scripts/ci/deploy.ts --stage pr-42 --sites '["access-electric"]'
 *   bun scripts/ci/deploy.ts --stage pr-42 --destroy --sites all
 *
 * Writes `deployments.json` ([{ site, url }]) for later steps (smoke, comment).
 * Production deploys are refused outside CI by each site's stack.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";

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

const deployments = sites.map((site) => {
  const directory = path.join(root, "apps", site);
  const output = execFileSync(
    "bun",
    [
      "alchemy",
      destroy ? "destroy" : "deploy",
      "--stage",
      stage,
      "--yes",
      "--no-input",
    ],
    { cwd: directory, encoding: "utf-8", env: deployEnv }
  );
  process.stdout.write(output);
  if (!destroy && existsSync(path.join(directory, "seed/seed.json"))) {
    const databaseId = DATABASE_OUTPUT.exec(output)?.groups?.id;
    if (databaseId === undefined) {
      throw new Error(`${site}: deploy reported no databaseId`);
    }
    migrateDatabase(directory, databaseId, deployEnv);
  }
  return { site, url: URL_OUTPUT.exec(output)?.groups?.url ?? null };
});

writeFileSync(
  path.join(root, "deployments.json"),
  `${JSON.stringify(deployments, null, 2)}\n`
);
