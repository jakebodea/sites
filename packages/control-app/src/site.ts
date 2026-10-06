/**
 * Where a site lives and how this checkout runs it locally: the app directory,
 * the per-worktree `dev-*` stage, its deterministic port, and the artifact
 * directory every command writes to. Pure path logic plus one `git` call, so
 * parallel worktrees resolve to different stages and ports without config.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  developmentStage,
  devPort,
} from "@jakebodea/cloudflare-kit/infra/stage";

export interface SiteContext {
  /** Directory name under `apps/`, e.g. `access-electric`. */
  readonly name: string;
  /** Absolute path of the site's app directory. */
  readonly directory: string;
  /** Repository (worktree) root. */
  readonly root: string;
  /** `dev-<worktree>` stage this checkout runs `alchemy dev` under. */
  readonly stage: string;
  readonly port: number;
  /** Local origin of the dev server. */
  readonly origin: string;
  /** `.artifacts/app/<site>/<stage>`: logs, screenshots, videos, session state. */
  readonly artifacts: string;
  /** Whether the site runs EmDash (has `seed/seed.json`); sites without one keep content in code. */
  readonly cms: boolean;
}

const gitRoot = (cwd: string): string =>
  execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf-8",
  }).trim();

/** Apps under `<root>/apps` that have an Alchemy stack. */
export const listSites = (root: string): string[] => {
  const apps = path.join(root, "apps");
  if (!existsSync(apps)) {
    return [];
  }
  return readdirSync(apps).filter((name) =>
    existsSync(path.join(apps, name, "alchemy.run.ts"))
  );
};

/**
 * Picks the site: the explicit `--site`, else the app the command runs inside,
 * else the only app in the repo.
 */
export const pickSite = (
  sites: readonly string[],
  requested: string | undefined,
  relativeCwd: string
): string => {
  if (requested !== undefined) {
    if (!sites.includes(requested)) {
      throw new Error(
        `Unknown site "${requested}". Sites: ${sites.join(", ")}`
      );
    }
    return requested;
  }
  const [top, inside] = relativeCwd.split(path.sep);
  if (top === "apps" && inside !== undefined && sites.includes(inside)) {
    return inside;
  }
  const [only] = sites;
  if (sites.length === 1 && only !== undefined) {
    return only;
  }
  throw new Error(`Pass --site <name>. Sites: ${sites.join(", ")}`);
};

export const resolveSite = (
  requested: string | undefined,
  cwd: string = process.cwd()
): SiteContext => {
  const root = gitRoot(cwd);
  const name = pickSite(listSites(root), requested, path.relative(root, cwd));
  const stage = developmentStage(path.basename(root));
  const port = devPort(stage);
  const directory = path.join(root, "apps", name);
  return {
    artifacts: path.join(root, ".artifacts", "app", name, stage),
    cms: existsSync(path.join(directory, "seed", "seed.json")),
    directory,
    name,
    origin: `http://localhost:${port}`,
    port,
    root,
    stage,
  };
};

/** Turns a URL path into a file-name-safe slug: `/portfolio/schools` -> `portfolio-schools`. */
export const pathSlug = (pathname: string): string => {
  const slug = pathname
    .split(/[^a-zA-Z0-9]+/u)
    .filter((part) => part !== "")
    .join("-");
  return slug === "" ? "home" : slug;
};
