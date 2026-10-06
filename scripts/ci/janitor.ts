/**
 * Destroys preview stages whose pull request is closed (the cleanup workflow
 * can miss some: cancelled runs, force-closed PRs). Finds `<site>-pr-<n>`
 * Workers through the Cloudflare API and keeps any whose PR is still open.
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

/** Preview stages to destroy: deployed `pr-<n>` stages whose PR is not open. */
export const staleStages = (
  workerNames: readonly string[],
  sites: readonly string[],
  openPulls: ReadonlySet<number>
): { site: string; stage: string }[] =>
  workerNames.flatMap((name) => {
    const site = sites.find((candidate) => name.startsWith(`${candidate}-`));
    const stage = site === undefined ? "" : name.slice(site.length + 1);
    const pull = Number(stage.slice("pr-".length));
    return site !== undefined &&
      isPullRequestStage(stage) &&
      !openPulls.has(pull)
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
      ["pr", "list", "--state", "open", "--json", "number", "--limit", "500"],
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
  for (const { site, stage } of stale) {
    process.stdout.write(`destroying ${site} ${stage}\n`);
    execFileSync(
      "bun",
      ["alchemy", "destroy", "--stage", stage, "--yes", "--no-input"],
      {
        cwd: path.join(root, "apps", site),
        stdio: "inherit",
      }
    );
  }
  process.stdout.write(`${stale.length} stale preview stage(s) destroyed\n`);
}
