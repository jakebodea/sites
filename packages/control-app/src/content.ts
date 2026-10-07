import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  EXPORT_PATH,
  PublishedSnapshot,
  composeFreshSeed,
  decodeSeed,
  contentPolicy,
} from "@jakebodea/cloudflare-kit/emdash/published-content";
import type { PublishedSite } from "@jakebodea/cloudflare-kit/emdash/published-content";
import { CONTENT_PLAN_FILE } from "@jakebodea/cloudflare-kit/emdash/published-integration";
import { validateFreshPlan } from "@jakebodea/cloudflare-kit/emdash/published-preflight";
import { Schema } from "effect";

import { request } from "./http.ts";
import { seedStage } from "./seed.ts";
import {
  readState,
  restoreSeedSnapshot,
  saveSeedSnapshot,
  start,
  stop,
  wipeLocalState,
} from "./server.ts";
import type { SiteContext } from "./site.ts";

const State = Schema.Struct({
  mode: Schema.Literals(["seed", "prod"]),
  validated: Schema.Boolean,
});
export type ContentMode = (typeof State.Type)["mode"];
const contentState = (site: SiteContext): string =>
  path.join(site.artifacts, "content.json");
export const selectedContent = (site: SiteContext): ContentMode => {
  const file = contentState(site);
  return existsSync(file)
    ? Schema.decodeUnknownSync(Schema.fromJsonString(State))(
        readFileSync(file, "utf-8")
      ).mode
    : "seed";
};
export const parseContentMode = (value: string): ContentMode =>
  Schema.decodeUnknownSync(State.fields.mode)(value);
const cmsSite = (site: SiteContext): PublishedSite => {
  if (site.name !== "access-electric" && site.name !== "ms-custom-homes") {
    throw new Error("This site has no published-content policy");
  }
  return site.name;
};
/** Only a site-owned origin is selectable; credentials never enter artifacts or compiled output. */
export const prepareProductionContent = async (
  site: SiteContext,
  refresh = false
): Promise<void> => {
  const name = cmsSite(site);
  const file = path.join(site.directory, CONTENT_PLAN_FILE);
  if (existsSync(file) && !refresh) {
    const saved: unknown = JSON.parse(readFileSync(file, "utf-8"));
    // Recompose against this branch rather than trusting a stale schema/default plan.
    const bundle = Schema.decodeUnknownSync(
      Schema.Struct({ snapshot: PublishedSnapshot })
    )(saved);
    const plan = composeFreshSeed(
      decodeSeed(
        JSON.parse(
          readFileSync(path.join(site.directory, "seed/seed.json"), "utf-8")
        )
      ),
      bundle.snapshot,
      name
    );
    await validateFreshPlan(plan);
    writeFileSync(file, JSON.stringify({ ...plan, snapshot: bundle.snapshot }));
    return;
  }
  const credential = process.env.PUBLISHED_CONTENT_EXPORT_TOKEN;
  if (credential === undefined || credential.length < 32) {
    throw new Error(
      "Production content requires private PUBLISHED_CONTENT_EXPORT_TOKEN setup"
    );
  }
  const response = await request(
    `${contentPolicy(name).origin}${EXPORT_PATH}`,
    {
      headers: { authorization: `Bearer ${credential}` },
      redirect: "error",
    }
  );
  if (!response.ok) {
    throw new Error(
      `Published source answered ${response.status}; seed fallback is disabled`
    );
  }
  const snapshot = Schema.decodeUnknownSync(PublishedSnapshot)(
    await response.json()
  );
  const branch = decodeSeed(
    JSON.parse(
      readFileSync(path.join(site.directory, "seed/seed.json"), "utf-8")
    )
  );
  const plan = composeFreshSeed(branch, snapshot, name);
  await validateFreshPlan(plan);
  writeFileSync(file, JSON.stringify({ ...plan, snapshot }));
};
const restoreFile = (file: string, bytes: Buffer | undefined): void => {
  if (bytes === undefined) {
    rmSync(file, { force: true });
  } else {
    writeFileSync(file, bytes);
  }
};
const LOCAL_BOOTSTRAP = "local-only-cms-bootstrap-credential";
const startFreshLocal = async (
  site: SiteContext,
  mode: ContentMode
): Promise<void> => {
  const restored = mode === "seed" && restoreSeedSnapshot(site);
  await start(site);
  await seedStage(site.origin, LOCAL_BOOTSTRAP, mode === "prod");
  if (mode === "seed" && !restored) {
    await stop(site);
    saveSeedSnapshot(site);
    await start(site);
  }
};
/** Backup while stopped; native setup and media completion must both succeed before activation. */
export const loadLocalContent = async (
  site: SiteContext,
  mode: ContentMode,
  refresh: boolean
): Promise<void> => {
  if (!site.cms) {
    if (mode === "prod") {
      throw new Error("This site has no CMS production content");
    }
    await wipeLocalState(site);
    await start(site);
    return;
  }
  mkdirSync(site.artifacts, { recursive: true });
  const planFile = path.join(site.directory, CONTENT_PLAN_FILE);
  const priorPlan = existsSync(planFile) ? readFileSync(planFile) : undefined;
  const stateFile = contentState(site);
  const priorMode = existsSync(stateFile) ? readFileSync(stateFile) : undefined;
  const authFile = path.join(site.artifacts, "auth.json");
  const priorAuth = existsSync(authFile) ? readFileSync(authFile) : undefined;
  const inputsFile = path.join(site.directory, ".build-inputs.json");
  const priorInputs = existsSync(inputsFile)
    ? readFileSync(inputsFile)
    : undefined;
  const local = path.join(site.directory, ".alchemy/local");
  const backup = path.join(site.artifacts, "content-rollback");
  const wasRunning = readState(site) !== undefined;
  // Fetch and disposable-schema preflight precede stopping or touching the prior emulator.
  try {
    if (mode === "prod") {
      await prepareProductionContent(site, refresh);
    } else {
      rmSync(planFile, { force: true });
    }
  } catch (error) {
    restoreFile(planFile, priorPlan);
    throw error;
  }
  const existed = existsSync(local);
  let replaced = false;
  process.env.CONTENT_MODE = mode;
  try {
    await stop(site);
    rmSync(backup, { force: true, recursive: true });
    if (existed) {
      cpSync(local, backup, { recursive: true });
    }
    replaced = true;
    rmSync(local, { force: true, recursive: true });
    rmSync(authFile, { force: true });
    await startFreshLocal(site, mode);
    writeFileSync(stateFile, JSON.stringify({ mode, validated: true }));
    rmSync(backup, { force: true, recursive: true });
  } catch (error) {
    if (replaced) {
      await stop(site);
      rmSync(local, { force: true, recursive: true });
      if (existed) {
        cpSync(backup, local, { recursive: true });
      }
    }
    restoreFile(planFile, priorPlan);
    restoreFile(stateFile, priorMode);
    restoreFile(authFile, priorAuth);
    restoreFile(inputsFile, priorInputs);
    process.env.CONTENT_MODE = selectedContent(site);
    if (wasRunning) {
      await start(site);
    }
    throw error;
  }
};
export const startWithContent = async (
  site: SiteContext,
  requested?: string
): Promise<void> => {
  const mode =
    requested === undefined
      ? selectedContent(site)
      : parseContentMode(requested);
  process.env.CONTENT_MODE = mode;
  if (!site.cms) {
    if (mode === "prod") {
      throw new Error("This site has no CMS production content");
    }
    await start(site);
    return;
  }
  if (
    mode === "prod" &&
    selectedContent(site) === "prod" &&
    !existsSync(path.join(site.directory, CONTENT_PLAN_FILE))
  ) {
    throw new Error(
      "Selected production content plan is missing; use content refresh"
    );
  }
  // Older checkouts have local edits but no content-mode marker. Starting them
  // must not turn this metadata migration into an implicit reset.
  if (
    mode === "seed" &&
    !existsSync(contentState(site)) &&
    existsSync(path.join(site.directory, ".alchemy/local"))
  ) {
    await start(site);
    mkdirSync(site.artifacts, { recursive: true });
    writeFileSync(
      contentState(site),
      JSON.stringify({ mode: "seed", validated: true })
    );
    return;
  }
  await (mode !== selectedContent(site) || !existsSync(contentState(site))
    ? loadLocalContent(site, mode, false)
    : start(site));
};
