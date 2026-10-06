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
import { writeFileSync } from "node:fs";
import path from "node:path";

import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";

const SiteList = Schema.fromJsonString(Schema.Array(Schema.String));
const URL_OUTPUT = /url:\s*'(?<url>https?:\/\/[^']+)'/u;

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

const deployments = sites.map((site) => {
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
    { cwd: path.join(root, "apps", site), encoding: "utf-8", env: process.env }
  );
  process.stdout.write(output);
  return { site, url: URL_OUTPUT.exec(output)?.groups?.url ?? null };
});

writeFileSync(
  path.join(root, "deployments.json"),
  `${JSON.stringify(deployments, null, 2)}\n`
);
