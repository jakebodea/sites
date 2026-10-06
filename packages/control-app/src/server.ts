/**
 * Runs the site under `alchemy dev` in the background for agents: start (and
 * warm up), stop, status, reset to a clean seeded state, and log access.
 * Everything Alchemy emulates (Worker, D1, R2, KV, Images) stays local; the
 * Alchemy profile comes from `ALCHEMY_PROFILE` like any other alchemy command.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import { request } from "./http.ts";
import type { SiteContext } from "./site.ts";

const DevState = Schema.Struct({
  origin: Schema.String,
  pid: Schema.Number,
  stage: Schema.String,
  startedAt: Schema.String,
});
type DevState = typeof DevState.Type;

const decodeState = Schema.decodeUnknownSync(Schema.fromJsonString(DevState));

const statePath = (site: SiteContext) =>
  path.join(site.artifacts, "dev-server.json");
export const logPath = (site: SiteContext) =>
  path.join(site.artifacts, "dev-server.log");

// oxlint-disable-next-line no-control-regex -- matches the ESC byte of ANSI color codes on purpose.
const ANSI_COLOR = /\u001B\[[0-9;]*m/gu;
const READY_TIMEOUT_MS = 240_000;
/**
 * A boot on a warm Vite cache settles in about 15 s, a cold one in about 70 s.
 * Past this, assume the module graph is stuck with two React copies after a
 * mid-boot re-optimize ("reading 'useState'" of null): retry once from a
 * clean cache.
 */
const FIRST_BOOT_TIMEOUT_MS = 150_000;
const POLL_MS = 1000;
/** Vite optimizes dependencies on the first requests; a few clean responses in a row mean it settled. */
const WARM_STREAK = 3;
const WARM_PATHS = ["/", "/contact", "/_emdash/admin"];

const sleep = async (ms: number) => {
  await Bun.sleep(ms);
};

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const readState = (site: SiteContext): DevState | undefined => {
  const file = statePath(site);
  if (!existsSync(file)) {
    return undefined;
  }
  const state = decodeState(readFileSync(file, "utf-8"));
  return isAlive(state.pid) ? state : undefined;
};

/**
 * A clean answer: no 5xx, and an HTML page must be complete within the
 * timeout. A render that throws mid-stream (Astro's `FontFamilyNotFound`, a
 * duplicate React during boot) still answers 200, then truncates or hangs.
 */
const responds = async (url: string): Promise<boolean> => {
  try {
    const response = await request(url, { redirect: "manual" });
    const isHtml =
      response.headers.get("content-type")?.includes("text/html") ?? false;
    if (response.status >= 500) {
      return false;
    }
    if (!isHtml) {
      return true;
    }
    const body = await response.text();
    return body.includes("</html>");
  } catch {
    return false;
  }
};

/** Waits until every warm-up path answers cleanly several times in a row; false on timeout. */
const waitUntilWarm = async (
  origin: string,
  timeoutMs: number
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  let streak = 0;
  while (streak < WARM_STREAK) {
    if (Date.now() > deadline) {
      return false;
    }
    const results = await Promise.all(
      WARM_PATHS.map(async (route) => await responds(`${origin}${route}`))
    );
    streak = results.every(Boolean) ? streak + 1 : 0;
    await sleep(POLL_MS);
  }
  return true;
};

const notReady = (origin: string): Error =>
  new Error(
    `Dev server at ${origin} did not become ready in time; check \`bun run app -- logs\`, then \`restart\``
  );

const viteCache = (site: SiteContext) =>
  path.join(site.directory, "node_modules", ".vite");

/**
 * Starts `alchemy dev`. The Vite dependency cache is kept: a complete cache
 * boots in ~15 s with no re-optimization. Building it is what makes cold
 * boots slow and noisy, so it is cleared only to recover a wedged boot.
 */
const spawnServer = (site: SiteContext): DevState => {
  mkdirSync(site.artifacts, { recursive: true });
  const log = openSync(logPath(site), "w");
  const child = spawn("bunx", ["alchemy", "dev", "--stage", site.stage], {
    cwd: site.directory,
    detached: true,
    env: process.env,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.unref();
  if (child.pid === undefined) {
    throw new Error("Could not start alchemy dev");
  }
  const state: DevState = {
    origin: site.origin,
    pid: child.pid,
    stage: site.stage,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(statePath(site), `${JSON.stringify(state, null, 2)}\n`);
  return state;
};

const signal = (pid: number) => {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
};

/**
 * PIDs listening on the site's dev port (Alchemy's runtime children are not always in our
 * group). LISTEN only: plain `tcp:<port>` also matches clients, including this CLI.
 */
const portOwners = (port: number): number[] => {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf-8",
    })
      .split("\n")
      .filter((line) => line !== "")
      .map(Number);
  } catch {
    return [];
  }
};

export const stop = async (site: SiteContext): Promise<boolean> => {
  const running = readState(site);
  rmSync(statePath(site), { force: true });
  const owners = portOwners(site.port);
  if (running === undefined && owners.length === 0) {
    return false;
  }
  if (running !== undefined) {
    // Started detached: signal the whole process group, then the leader itself.
    signal(-running.pid);
    signal(running.pid);
  }
  for (const pid of owners) {
    signal(pid);
  }
  const deadline = Date.now() + 15_000;
  while (portOwners(site.port).length > 0 && Date.now() < deadline) {
    await sleep(250);
  }
  return true;
};

/** Starts `alchemy dev` for this worktree's stage in the background, or reuses a running one. */
export const start = async (site: SiteContext): Promise<DevState> => {
  const running = readState(site);
  if (running !== undefined) {
    if (!(await waitUntilWarm(running.origin, READY_TIMEOUT_MS))) {
      throw notReady(running.origin);
    }
    return running;
  }
  const state = spawnServer(site);
  if (await waitUntilWarm(site.origin, FIRST_BOOT_TIMEOUT_MS)) {
    return state;
  }
  process.stderr.write(
    "Dev server came up broken (Vite re-optimized mid-boot); restarting once from a clean Vite cache\n"
  );
  await stop(site);
  rmSync(viteCache(site), { force: true, recursive: true });
  const retry = spawnServer(site);
  if (!(await waitUntilWarm(site.origin, READY_TIMEOUT_MS))) {
    throw notReady(site.origin);
  }
  return retry;
};

const localState = (site: SiteContext) =>
  path.join(site.directory, ".alchemy", "local");

/** Stops the server and deletes this site's local Alchemy state (D1, R2, KV) so the next start is clean. */
export const wipeLocalState = async (site: SiteContext): Promise<void> => {
  await stop(site);
  rmSync(localState(site), { force: true, recursive: true });
  rmSync(path.join(site.artifacts, "auth.json"), { force: true });
};

/**
 * Identifies one seeded state: the seed, its media, and the dependency
 * versions (EmDash migrations). Any change means seeding again.
 */
const seedKey = (site: SiteContext): string => {
  const hash = createHash("sha256");
  const seed = path.join(site.directory, "seed");
  hash.update(readFileSync(path.join(seed, "seed.json")));
  const media = path.join(seed, "media");
  const files = existsSync(media) ? readdirSync(media).toSorted() : [];
  for (const file of files) {
    hash.update(`${file}:${statSync(path.join(media, file)).size}\n`);
  }
  hash.update(readFileSync(path.join(site.root, "bun.lock")));
  return hash.digest("hex").slice(0, 16);
};

const SNAPSHOT_PREFIX = "seeded-";
const snapshotPath = (site: SiteContext) =>
  path.join(site.artifacts, `${SNAPSHOT_PREFIX}${seedKey(site)}`);

/** Copy-on-write clone where the filesystem supports it (APFS, btrfs), else a plain copy. */
const cloneTree = (from: string, to: string) => {
  cpSync(from, to, { mode: constants.COPYFILE_FICLONE, recursive: true });
};

/**
 * Restores the seeded local state saved by {@link saveSeedSnapshot}, skipping
 * the ~20 s seed (which downloads every seed image). False when none matches
 * the current seed. Call with the server stopped.
 */
export const restoreSeedSnapshot = (site: SiteContext): boolean => {
  const snapshot = snapshotPath(site);
  if (!existsSync(snapshot)) {
    return false;
  }
  cloneTree(snapshot, localState(site));
  return true;
};

/** Saves the freshly seeded local state, replacing older snapshots. Call with the server stopped so SQLite files are closed. */
export const saveSeedSnapshot = (site: SiteContext): void => {
  const snapshot = snapshotPath(site);
  for (const entry of readdirSync(site.artifacts)) {
    if (entry.startsWith(SNAPSHOT_PREFIX)) {
      rmSync(path.join(site.artifacts, entry), {
        force: true,
        recursive: true,
      });
    }
  }
  cloneTree(localState(site), snapshot);
};

export const tailLog = (site: SiteContext, lines: number): string => {
  const file = logPath(site);
  if (!existsSync(file)) {
    return "";
  }
  // Strip ANSI colors so agents read plain text.
  return readFileSync(file, "utf-8")
    .replaceAll(ANSI_COLOR, "")
    .split("\n")
    .slice(-lines)
    .join("\n");
};
