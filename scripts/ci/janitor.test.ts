import { describe, expect, it } from "vitest";

import { staleStages } from "./janitor.ts";

describe(staleStages, () => {
  it("destroys previews of closed PRs only", () => {
    expect(
      staleStages(
        [
          "access-electric-pr-1",
          "access-electric-pr-2",
          "access-electric-prod",
          "access-electric-dev-alice",
          "turbo-cache",
        ],
        ["access-electric"],
        new Set([2])
      )
    ).toStrictEqual([{ site: "access-electric", stage: "pr-1" }]);
  });
});
