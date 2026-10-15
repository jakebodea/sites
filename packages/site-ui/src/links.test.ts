import { describe, expect, it } from "vitest";

import { isCurrentPath, isExternal } from "./links.ts";

describe(isCurrentPath, () => {
  it("marks a section link current on the section and its subpages", () => {
    const current = ["/portfolio", "/portfolio/kitchens/", "/portfolios"].map(
      (path) => isCurrentPath(path, "/portfolio")
    );
    expect(current).toStrictEqual([true, true, false]);
  });

  it("matches a locale home only on itself", () => {
    const homes = ["/", "/es"];
    const current = [
      isCurrentPath("/", "/"),
      isCurrentPath("/about", "/"),
      isCurrentPath("/es/nosotros", "/es", homes),
      isCurrentPath("/es/", "/es", homes),
    ];
    expect(current).toStrictEqual([true, false, false, true]);
  });

  it("never marks an off-site link current", () => {
    expect([isCurrentPath("/", "https://example.com/")]).toStrictEqual([false]);
  });
});

describe(isExternal, () => {
  it("treats only absolute http(s) links as external", () => {
    const external = [
      "https://equityfast.example",
      "/contact",
      "mailto:hi@example.com",
    ].map(isExternal);
    expect(external).toStrictEqual([true, false, false]);
  });
});
