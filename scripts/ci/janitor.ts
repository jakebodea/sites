/**
 * Finds preview stages whose pull request is closed or has no preview label (the cleanup workflow
 * can miss some: cancelled runs, force-closed PRs). Finds `<site>-pr-<n>`
 * Workers through the read-only Cloudflare API. Prints PR numbers for the workflow,
 * which rechecks current state and destroys through Alchemy under each PR's stage lock.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... GH_TOKEN=... bun scripts/ci/janitor.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { isPullRequestStage } from "@jakebodea/cloudflare-kit/infra/stage";
import { listSites } from "@jakebodea/control-app/site";
import { Schema } from "effect";

const Scripts = Schema.Struct({
  result: Schema.Array(Schema.Struct({ id: Schema.String })),
});
const OpenPulls = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ number: Schema.Number }))
);

/** Preview stages to destroy: deployed `pr-<n>` stages whose PR is not open and labeled preview. */
export const staleStages = (
  workerNames: readonly string[],
  sites: readonly string[],
  previewPulls: ReadonlySet<number>
): { site: string; stage: string }[] =>
  workerNames.flatMap((name) => {
    const site = sites.find((candidate) => name.startsWith(`${candidate}-`));
    const stage = site === undefined ? "" : name.slice(site.length + 1);
    const pull = Number(stage.slice("pr-".length));
    return site !== undefined &&
      isPullRequestStage(stage) &&
      !previewPulls.has(pull)
      ? [{ site, stage }]
      : [];
  });

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, "../..");
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`,
    {
      headers: {
        authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN ?? ""}`,
      },
    }
  );
  const { result } = Schema.decodeUnknownSync(Scripts)(await response.json());
  const open = Schema.decodeUnknownSync(OpenPulls)(
    execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number",
        "--label",
        "preview",
        "--limit",
        "500",
      ],
      {
        encoding: "utf-8",
      }
    )
  );
  const stale = staleStages(
    result.map((script) => script.id),
    listSites(root),
    new Set(open.map((pull) => pull.number))
  );
  const pulls = [...new Set(stale.map(({ stage }) => Number(stage.slice(3))))];
  process.stdout.write(`${JSON.stringify(pulls)}\n`);
}
