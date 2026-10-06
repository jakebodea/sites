/**
 * Applies EmDash's core migrations to a deployed site's D1 from CI, so no
 * visitor or smoke request runs them. A request that runs them on a fresh
 * database and is cut off leaves EmDash's migration lock held for good.
 * Uses the job's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
 */
import { execFileSync } from "node:child_process";

import { Schema } from "effect";

const Status = Schema.fromJsonString(
  Schema.Struct({
    target: Schema.Struct({ fingerprint: Schema.String }),
  })
);

const emdashMigrate = (
  directory: string,
  env: NodeJS.ProcessEnv,
  args: readonly string[]
) =>
  execFileSync("bunx", ["emdash", "migrate", "--from-config", ...args], {
    cwd: directory,
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });

export const migrateDatabase = (
  directory: string,
  databaseId: string,
  env: NodeJS.ProcessEnv
) => {
  const { target } = Schema.decodeUnknownSync(Status)(
    emdashMigrate(directory, env, ["--status", "--json", "--d1", databaseId])
  );
  process.stdout.write(
    emdashMigrate(directory, env, [
      "--d1",
      databaseId,
      "--expected-target-fingerprint",
      target.fingerprint,
    ])
  );
};
