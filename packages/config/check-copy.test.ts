import { describe, expect, it } from "vitest";

import { findLongDashes } from "./check-copy";

describe(findLongDashes, () => {
  it("reports each em and en dash with its position", () => {
    const content = "<h1>Built right</h1>\n<p>On time — on budget – always</p>";
    expect(findLongDashes("page.astro", content)).toStrictEqual([
      { column: 12, line: 2, path: "page.astro" },
      { column: 24, line: 2, path: "page.astro" },
    ]);
  });

  it("accepts hyphens", () => {
    expect(
      findLongDashes("seed.json", '{"title": "K-12 Schools"}')
    ).toStrictEqual([]);
  });
});
