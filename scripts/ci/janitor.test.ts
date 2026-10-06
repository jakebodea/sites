import { describe, expect, it } from "vitest";

import { staleStages } from "./janitor.ts";

describe(staleStages, () => {
  it("keeps only previews of open PRs labeled preview", () => {
    expect(
      staleStages(
        [
          "access-electric-pr-1",
          "access-electric-pr-2",
          "access-electric-pr-3",
          "jbolabs-pr-1",
          "jbolabs-pr-2",
          "access-electric-prod",
          "access-electric-dev-alice",
          "turbo-cache",
        ],
        ["access-electric", "jbolabs"],
        new Set([2])
      )
    ).toStrictEqual([
      { site: "access-electric", stage: "pr-1" },
      { site: "access-electric", stage: "pr-3" },
      { site: "jbolabs", stage: "pr-1" },
    ]);
  });
});
