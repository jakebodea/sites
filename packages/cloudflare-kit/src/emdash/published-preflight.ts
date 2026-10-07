/** Node/Bun only: no destination writes until the branch plan passes this disposable adapter. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ContentRepository } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/libsql";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";

import { preflightFresh } from "./published-content.ts";
import type { FreshPlan } from "./published-content.ts";

type Tables =
  ConstructorParameters<typeof ContentRepository>[0] extends Kysely<infer T>
    ? T
    : never;
export const validateFreshPlan = async (plan: FreshPlan): Promise<void> => {
  const directory = mkdtempSync(path.join(tmpdir(), "published-preflight-"));
  const db = new Kysely<Tables>({
    dialect: createDialect({
      url: `file:${path.join(directory, "content.sqlite")}`,
    }),
  });
  try {
    await runMigrations(db);
    await applySeed(
      db,
      {
        blockTypes: plan.seed.blockTypes,
        collections: plan.seed.collections,
        relations: plan.seed.relations,
        version: "1",
      },
      { onConflict: "error" }
    );
    await applySeed(db, plan.seed, {
      includeContent: true,
      skipMediaDownload: true,
    });
    await preflightFresh(db, plan);
  } finally {
    await db.destroy();
    rmSync(directory, { force: true, recursive: true });
  }
};
