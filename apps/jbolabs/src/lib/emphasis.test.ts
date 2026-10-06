import { describe, expect, it } from "vitest";

import { emphasisSegments } from "./emphasis.ts";

describe(emphasisSegments, () => {
  it("marks words wrapped in asterisks", () => {
    expect(emphasisSegments("Websites *built with care*.")).toStrictEqual([
      { emphasis: false, text: "Websites " },
      { emphasis: true, text: "built with care" },
      { emphasis: false, text: "." },
    ]);
  });

  it("leaves plain and unmatched text alone", () => {
    expect(emphasisSegments("5 * 3 projects")).toStrictEqual([
      { emphasis: false, text: "5 * 3 projects" },
    ]);
    expect(emphasisSegments("")).toStrictEqual([]);
  });
});
