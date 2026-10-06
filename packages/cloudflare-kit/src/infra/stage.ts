/**
 * Stage naming and per-stage origins, shared by every site's `alchemy.run.ts`
 * and the CI scripts so they agree on what a stage is called and where it lives.
 *
 * - `prod`: the live site on the custom domain.
 * - `pr-<n>`: a pull request preview, destroyed when the PR closes.
 * - `dev-<worktree>`: a developer's `alchemy dev` stage (one per git worktree).
 * - anything else (for example `ae-preview`): a named, long-lived preview.
 */

export type StageKind = "production" | "pull-request" | "development" | "named";

export interface SiteIdentity {
  /** Short kebab-case id; prefixes every Worker name (`<id>-<stage>`). */
  readonly id: string;
  /** Production hostname, attached as a custom domain on `prod` only. */
  readonly domain: string;
  /** The Cloudflare account's `workers.dev` subdomain, which non-prod stages are served from. */
  readonly workersSubdomain: string;
}

export interface StageSettings {
  readonly stage: string;
  readonly kind: StageKind;
  readonly production: boolean;
  /** Worker script name; deterministic so CI can compute preview URLs before deploying. */
  readonly workerName: string;
  /** Public origin visitors use for this stage. */
  readonly origin: string;
}

const PULL_REQUEST_STAGE = /^pr-[1-9]\d*$/u;
const DEVELOPMENT_STAGE = /^dev-[a-z0-9-]+$/u;
const STAGE_NAME = /^[a-z][a-z0-9-]{0,30}$/u;

export const stageKind = (stage: string): StageKind => {
  if (stage === "prod") {
    return "production";
  }
  if (PULL_REQUEST_STAGE.test(stage)) {
    return "pull-request";
  }
  return DEVELOPMENT_STAGE.test(stage) ? "development" : "named";
};

export const isPullRequestStage = (stage: string): boolean =>
  PULL_REQUEST_STAGE.test(stage);

export const resolveStage = (
  site: SiteIdentity,
  stage: string
): StageSettings => {
  if (!STAGE_NAME.test(stage)) {
    throw new Error(
      `Invalid stage "${stage}": use lowercase letters, digits, and hyphens (max 31 chars).`
    );
  }
  const kind = stageKind(stage);
  const production = kind === "production";
  const workerName = `${site.id}-${stage}`;
  return {
    kind,
    origin: production
      ? `https://${site.domain}`
      : `https://${workerName}.${site.workersSubdomain}.workers.dev`,
    production,
    stage,
    workerName,
  };
};

/** `dev-<worktree directory>`, sanitized to a valid stage name. */
export const developmentStage = (worktreeDirectory: string): string => {
  const slug = worktreeDirectory
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part !== "")
    .join("-")
    .slice(0, 26);
  return `dev-${slug === "" ? "local" : slug}`;
};

/**
 * Production deploys run from CI (or with an explicit human override), never
 * from an agent's shell. Returns a reason when the deploy must be refused.
 */
export const productionDeployRefusal = (
  settings: StageSettings,
  env: Readonly<Record<string, string | undefined>>
): string | undefined => {
  if (!settings.production) {
    return undefined;
  }
  if (env.CI === "true" || env.ALLOW_PROD_DEPLOY === "1") {
    return undefined;
  }
  return "Refusing to deploy prod outside CI. Merge to main, or set ALLOW_PROD_DEPLOY=1 yourself if you are a human doing a deliberate manual release.";
};

const DEV_PORT_BASE = 4300;
const DEV_PORT_RANGE = 600;

/**
 * Deterministic local port for a stage, so parallel worktrees running
 * `alchemy dev` never collide and scripts can find the server without asking.
 */
export const devPort = (stage: string): number => {
  let hash = 0;
  for (const char of stage) {
    hash = Math.imul(hash, 31) + (char.codePointAt(0) ?? 0);
  }
  return DEV_PORT_BASE + (Math.abs(hash) % DEV_PORT_RANGE);
};
