/**
 * Which sites a change touches. A change inside `apps/<site>/` affects that
 * site; a change to shared code or tooling (packages, lockfile, root config)
 * affects every site. Docs and agent instructions affect none.
 *
 *   bun scripts/ci/affected.ts <base-ref>     # prints a JSON array of site names
 */
import { execFileSync } from "node:child_process";

import { listSites } from "@jakebodea/control-app/site";

const SITE_PATH = /^apps\/(?<site>[^/]+)\//u;
const SHARED_PATHS = [
  /^packages\//u,
  /^bun\.lock$/u,
  /^package\.json$/u,
  /^turbo\.json$/u,
  /^tsconfig\.json$/u,
  /^bunfig\.toml$/u,
];

export const affectedSites = (
  changedFiles: readonly string[],
  sites: readonly string[]
): string[] => {
  if (
    changedFiles.some((file) =>
      SHARED_PATHS.some((pattern) => pattern.test(file))
    )
  ) {
    return [...sites];
  }
  const touched = new Set(
    changedFiles.flatMap((file) => {
      const site = SITE_PATH.exec(file)?.groups?.site;
      return site === undefined ? [] : [site];
    })
  );
  return sites.filter((site) => touched.has(site));
};

if (import.meta.main) {
  const base = process.argv[2] ?? "origin/main";
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  }).trim();
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`],
    {
      cwd: root,
      encoding: "utf-8",
    }
  )
    .split("\n")
    .filter((line) => line !== "");
  process.stdout.write(
    `${JSON.stringify(affectedSites(changed, listSites(root)))}\n`
  );
}
