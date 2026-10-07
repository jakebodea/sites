import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  loadLocalContent,
  selectedContent,
  startWithContent,
} from "./content.ts";
import type { SiteContext } from "./site.ts";

/** Real disk-backed prior copy; incompatible cached input must fail before invoking Alchemy. */
describe("local content activation", () => {
  it("leaves the prior plan, selection and local copy intact when cached candidate validation fails", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "local-content-"));
    const site: SiteContext = {
      artifacts: path.join(root, "artifacts"),
      cms: true,
      directory: path.join(root, "site"),
      name: "access-electric",
      origin: "http://localhost:65431",
      port: 65_431,
      root,
      stage: "dev-fixture",
    };
    mkdirSync(path.join(site.directory, ".alchemy/local"), { recursive: true });
    mkdirSync(site.artifacts, { recursive: true });
    const plan = path.join(site.directory, ".published-content.json");
    const state = path.join(site.artifacts, "content.json");
    const prior = path.join(site.directory, ".alchemy/local/prior-copy");
    writeFileSync(plan, JSON.stringify({ snapshot: { site: "wrong-site" } }));
    writeFileSync(state, JSON.stringify({ mode: "prod", validated: true }));
    const originalDb = new DatabaseSync(prior);
    originalDb.exec(
      "CREATE TABLE content (title TEXT); INSERT INTO content VALUES ('prior local content')"
    );
    originalDb.close();
    try {
      const bytes = readFileSync(plan, "utf-8");
      await expect(loadLocalContent(site, "prod", false)).rejects.toThrow(
        "Missing key"
      );
      const restoredDb = new DatabaseSync(prior);
      const content = restoredDb.prepare("SELECT title FROM content").get();
      restoredDb.close();
      expect({
        local: content?.title,
        mode: selectedContent(site),
        plan: readFileSync(plan, "utf-8"),
      }).toStrictEqual({
        local: "prior local content",
        mode: "prod",
        plan: bytes,
      });
      rmSync(plan);
      await expect(startWithContent(site)).rejects.toThrow(
        "production content plan is missing"
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
