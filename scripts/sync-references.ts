/**
 * Clones the source of the libraries this stack leans on into gitignored
 * `.repos/`, at the versions the workspace pins, so agents read real code
 * (Effect 4, Alchemy v2 beta, EmDash) instead of guessing from training data.
 *
 *   bun run references            # clone or update every reference repo
 *   bun run references effect     # just one
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

interface ReferenceRepo {
  readonly id: string;
  readonly url: string;
  /** Catalog package whose pinned version selects the git tag. */
  readonly versionOf: string;
  readonly tag: (version: string) => string;
}

export const REFERENCE_REPOS: readonly ReferenceRepo[] = [
  {
    id: "effect",
    tag: (version) => `effect@${version}`,
    url: "https://github.com/Effect-TS/effect.git",
    versionOf: "effect",
  },
  {
    id: "alchemy",
    tag: (version) => `v${version}`,
    url: "https://github.com/alchemy-run/alchemy.git",
    versionOf: "alchemy",
  },
  {
    id: "emdash",
    tag: (version) => `emdash@${version}`,
    url: "https://github.com/emdash-cms/emdash.git",
    versionOf: "emdash",
  },
];

const RootPackage = Schema.Struct({
  workspaces: Schema.Struct({
    catalog: Schema.Record(Schema.String, Schema.String),
  }),
});

const git = (args: string[], cwd: string) =>
  execFileSync("git", args, { cwd, stdio: "inherit" });

const tagExists = (url: string, tag: string): boolean =>
  execFileSync("git", ["ls-remote", "--tags", url, tag], {
    encoding: "utf-8",
  }).trim() !== "";

const sync = (root: string, repo: ReferenceRepo, version: string): string => {
  const directory = path.join(root, ".repos", repo.id);
  const tag = repo.tag(version);
  // Prereleases are not always tagged; fall back to the default branch and say so.
  const ref = tagExists(repo.url, tag) ? tag : undefined;
  if (existsSync(directory)) {
    git(["fetch", "--depth", "1", "origin", ref ?? "HEAD"], directory);
    git(["checkout", "--force", "FETCH_HEAD"], directory);
  } else {
    mkdirSync(path.dirname(directory), { recursive: true });
    git(
      [
        "clone",
        "--depth",
        "1",
        ...(ref === undefined ? [] : ["--branch", ref]),
        repo.url,
        directory,
      ],
      root
    );
  }
  return ref ?? `${repo.id}: no tag ${tag}, using the default branch`;
};

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, "..");
  const { catalog } = Schema.decodeUnknownSync(
    Schema.fromJsonString(RootPackage)
  )(readFileSync(path.join(root, "package.json"), "utf-8")).workspaces;
  const only = process.argv.slice(2);
  const selected = REFERENCE_REPOS.filter(
    (repo) => only.length === 0 || only.includes(repo.id)
  );
  for (const repo of selected) {
    const version = catalog[repo.versionOf];
    process.stdout.write(
      version === undefined
        ? `skip ${repo.id}: ${repo.versionOf} is not in the catalog\n`
        : `${repo.id} -> ${sync(root, repo, version)}\n`
    );
  }
}
