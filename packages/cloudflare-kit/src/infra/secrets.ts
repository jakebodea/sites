/**
 * Local secrets live in gitignored `.env` files in the MAIN checkout only.
 * Git worktrees resolve the main checkout through the git common dir, so every
 * worktree reads the same files without copying secrets around.
 *
 * Order (later wins): repo-root `.env`, then the site's own `.env`, then the
 * process environment (CI injects GitHub environment secrets there).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import * as Secrets from "alchemy/Secrets";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

/** Absolute path of the main checkout (not the current worktree), or undefined outside git. */
export const mainCheckoutRoot = (cwd: string): string | undefined => {
  try {
    const commonDir = git(
      cwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    );
    return path.dirname(commonDir);
  } catch {
    return undefined;
  }
};

/** Existing `.env` files for `cwd`, resolved in the main checkout. */
export const mainCheckoutEnvFiles = (cwd: string): string[] => {
  const root = mainCheckoutRoot(cwd);
  if (root === undefined) {
    return [];
  }
  const worktreeRoot = git(cwd, "rev-parse", "--show-toplevel");
  const sitePath = path.relative(worktreeRoot, cwd);
  const candidates = [
    path.join(root, ".env"),
    path.join(root, sitePath, ".env"),
  ];
  return [...new Set(candidates)].filter((file) => existsSync(file));
};

/** The `secrets` option for a site's `Alchemy.Stack`. */
export const siteSecrets = (cwd: string = process.cwd()) => {
  const files = mainCheckoutEnvFiles(cwd);
  return files.length === 0
    ? [Secrets.ProcessEnv()]
    : [Secrets.DotEnv({ path: files }), Secrets.ProcessEnv()];
};
