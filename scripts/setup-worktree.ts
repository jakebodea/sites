/**
 * Prepares a new git worktree (run by T3 Code via `t3.json` and by lefthook's
 * `post-checkout`): symlinks the main checkout's gitignored `.env` files into
 * this worktree and installs dependencies. Real `.env` files stay in the main
 * checkout only; this never replaces anything but its own symlinks.
 *
 *   bun run setup:worktree
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";

const run = (file: string, args: string[], cwd: string) =>
  execFileSync(file, args, { cwd, encoding: "utf-8" }).trim();

/** `.env` at the repo root plus one per app, relative to the repository root. */
export const envFiles = (root: string): string[] => {
  const apps = path.join(root, "apps");
  const perApp = existsSync(apps)
    ? readdirSync(apps).map((name) => path.join("apps", name, ".env"))
    : [];
  return [".env", ...perApp];
};

const linkEnvFiles = (main: string, worktree: string): string[] =>
  envFiles(main).flatMap((file) => {
    const source = path.join(main, file);
    const target = path.join(worktree, file);
    if (!existsSync(source) || !existsSync(path.dirname(target))) {
      return [];
    }
    const existing = existsSync(target) ? lstatSync(target) : undefined;
    if (existing !== undefined && !existing.isSymbolicLink()) {
      // A real file here is a deliberate per-worktree override; leave it.
      return [];
    }
    rmSync(target, { force: true });
    symlinkSync(source, target);
    return [file];
  });

if (import.meta.main) {
  const worktree = run("git", ["rev-parse", "--show-toplevel"], process.cwd());
  const main = path.dirname(
    run(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      worktree
    )
  );
  if (main === worktree) {
    process.stdout.write("Main checkout: nothing to link.\n");
  } else {
    const linked = linkEnvFiles(main, worktree);
    process.stdout.write(
      linked.length === 0
        ? "No .env files in the main checkout to link.\n"
        : `Linked from the main checkout: ${linked.join(", ")}\n`
    );
  }
  execFileSync("bun", ["install", "--frozen-lockfile"], {
    cwd: worktree,
    stdio: "inherit",
  });
}
