/**
 * Creates or updates one PR comment listing the preview URLs from
 * `deployments.json`, so pushes edit the same comment instead of piling up.
 *
 *   GH_TOKEN=... bun scripts/ci/comment.ts --pr 42 --stage pr-42
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const Deployments = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({ site: Schema.String, url: Schema.NullOr(Schema.String) })
  )
);
/** `--paginate --slurp` prints one array per page; gh refuses `--slurp` with `--jq`. */
const CommentPages = Schema.fromJsonString(
  Schema.Array(
    Schema.Array(Schema.Struct({ body: Schema.String, id: Schema.Number }))
  )
);
const MARKER = "<!-- marketing-previews -->";

const flag = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const root = path.resolve(import.meta.dirname, "../..");
const pr = flag("--pr");
const stage = flag("--stage");
const repo = process.env.GITHUB_REPOSITORY ?? "";
const deployments = Schema.decodeUnknownSync(Deployments)(
  readFileSync(path.join(root, "deployments.json"), "utf-8")
);

const rows = deployments
  .map(
    ({ site, url }) => `| ${site} | ${url ?? "deploy did not report a URL"} |`
  )
  .join("\n");
const body = `${MARKER}
### Previews (stage \`${stage}\`)

| Site | URL |
| --- | --- |
${rows}

Smoke and Lighthouse results are in the workflow run. EmDash admin on a preview starts at first-run setup.
`;

const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf-8" });
const existing = Schema.decodeUnknownSync(CommentPages)(
  gh(["api", `repos/${repo}/issues/${pr}/comments`, "--paginate", "--slurp"])
)
  .flat()
  .find((comment) => comment.body.startsWith(MARKER));

if (existing === undefined) {
  gh(["api", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`]);
} else {
  gh([
    "api",
    "-X",
    "PATCH",
    `repos/${repo}/issues/comments/${existing.id}`,
    "-f",
    `body=${body}`,
  ]);
}
