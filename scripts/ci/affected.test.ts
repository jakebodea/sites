import { describe, expect, it } from "vitest";

import { affectedSites } from "./affected.ts";

const sites = ["access-electric", "ms-homes"];

describe(affectedSites, () => {
  it("scopes app changes to that app", () => {
    expect(
      affectedSites(["apps/ms-homes/src/pages/index.astro"], sites)
    ).toStrictEqual(["ms-homes"]);
  });

  it("deploys every site when shared code changes", () => {
    expect(
      affectedSites(["packages/cloudflare-kit/src/server/email.ts"], sites)
    ).toStrictEqual(sites);
    expect(affectedSites(["bun.lock"], sites)).toStrictEqual(sites);
  });

  it("deploys nothing for docs-only changes", () => {
    expect(affectedSites(["docs/stack.md", "AGENTS.md"], sites)).toStrictEqual(
      []
    );
  });
});
