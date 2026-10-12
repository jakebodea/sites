import { describe, expect, it } from "vitest";

import { siteObservability } from "./observability.ts";
import { resolveStage } from "./stage.ts";

const site = {
  domain: null,
  id: "example",
  workersSubdomain: "acme",
};

describe(siteObservability, () => {
  it("enables Issues without losing production logs or sampled traces", () => {
    expect(siteObservability(resolveStage(site, "prod"))).toStrictEqual({
      enabled: true,
      issues: { enabled: true },
      logs: {
        enabled: true,
        headSamplingRate: 1,
        invocationLogs: true,
        persist: true,
      },
      traces: {
        enabled: true,
        headSamplingRate: 0.1,
        persist: true,
      },
    });
  });

  it.each(["dev-upgrade", "pr-82"])(
    "keeps full trace sampling and Issues on %s",
    (stage) => {
      expect(siteObservability(resolveStage(site, stage))).toStrictEqual({
        enabled: true,
        issues: { enabled: true },
        logs: {
          enabled: true,
          headSamplingRate: 1,
          invocationLogs: true,
          persist: true,
        },
        traces: {
          enabled: true,
          headSamplingRate: 1,
          persist: true,
        },
      });
    }
  );
});
