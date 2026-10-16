import { describe, expect, it } from "vitest";

import { failureKind } from "./errors.ts";

describe(failureKind, () => {
  it.each([
    ["429 Rate limited: too many requests to this gateway", "rate-limit"],
    ["AiError: Capacity temporarily exceeded, please try again.", "rate-limit"],
    [
      "This model's maximum context length is 1048576 tokens. However, you requested 1100000 tokens.",
      "too-long",
    ],
    ["Input is too long for the requested model", "too-long"],
    ["fetch failed", "other"],
  ] as const)("reads %j as %s", (message, kind) => {
    expect(failureKind(message)).toBe(kind);
  });
});
