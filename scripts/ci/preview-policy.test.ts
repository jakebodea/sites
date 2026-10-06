import { describe, expect, it } from "vitest";

import { affectedSites } from "./affected.ts";
import { previewPolicy } from "./preview-policy.ts";

const pull = {
  headRefOid: "current-head",
  labels: [{ name: "preview" }],
  state: "OPEN",
} satisfies Parameters<typeof previewPolicy>[0];

describe(previewPolicy, () => {
  it("deploys the requested current head and only affected sites", () => {
    const policy = previewPolicy(pull, "current-head");
    expect(policy).toStrictEqual({ deploy: true, destroy: false });
    expect(
      policy.deploy
        ? affectedSites(
            ["apps/jbolabs/src/content/home.ts"],
            ["jbolabs", "access-electric"]
          )
        : []
    ).toStrictEqual(["jbolabs"]);
  });

  it("skips stale deploys without destroying a requested preview", () => {
    expect(previewPolicy(pull, "old-head")).toStrictEqual({
      deploy: false,
      destroy: false,
    });
  });

  it("destroys after label removal and ignores unrelated labels", () => {
    expect(
      previewPolicy({ ...pull, labels: [{ name: "bug" }] }, "current-head")
    ).toStrictEqual({ deploy: false, destroy: true });
  });

  it.each(["CLOSED", "MERGED"] satisfies Parameters<
    typeof previewPolicy
  >[0]["state"][])(
    "destroys %s PR previews even if the label remains",
    (state) => {
      expect(previewPolicy({ ...pull, state }, "current-head")).toStrictEqual({
        deploy: false,
        destroy: true,
      });
    }
  );

  it("skips queued cleanup after relabeling or reopening", () => {
    expect(previewPolicy(pull)).toStrictEqual({
      deploy: false,
      destroy: false,
    });
  });
});
