import { describe, expect, it } from "vitest";

import { adminThemeCss, injectAdminTheme } from "./theme.ts";

const theme = {
  brand: "oklch(0.38 0.05 225)",
  brandHover: "oklch(0.24 0.035 230)",
  brandOnDark: "oklch(0.72 0.06 225)",
  canvas: "oklch(0.992 0.002 100)",
  radius: "0.5rem",
};

describe(adminThemeCss, () => {
  it("overrides Kumo's brand tokens for light and dark mode", () => {
    expect(adminThemeCss(theme)).toBe(
      [
        "html[data-theme]:not([data-mode=dark]){--color-kumo-brand:oklch(0.38 0.05 225);--color-kumo-brand-hover:oklch(0.24 0.035 230);--text-color-kumo-brand:oklch(0.38 0.05 225);--text-color-kumo-link:oklch(0.38 0.05 225);--color-kumo-canvas:oklch(0.992 0.002 100);--color-kumo-elevated:oklch(0.992 0.002 100);--radius-lg:0.5rem;--radius-md:calc(0.5rem * 0.75);--radius-sm:calc(0.5rem * 0.5);--radius-xl:calc(0.5rem * 1.5)}",
        "html[data-theme][data-mode=dark]{--color-kumo-brand:oklch(0.72 0.06 225);--color-kumo-brand-hover:oklch(0.38 0.05 225);--text-color-kumo-brand:oklch(0.72 0.06 225);--text-color-kumo-link:oklch(0.72 0.06 225);--radius-lg:0.5rem;--radius-md:calc(0.5rem * 0.75);--radius-sm:calc(0.5rem * 0.5);--radius-xl:calc(0.5rem * 1.5)}",
      ].join("\n")
    );
  });

  it("leaves surfaces and radii alone when a site keeps EmDash's", () => {
    expect(
      adminThemeCss({ brand: "#123", brandHover: "#012", brandOnDark: "#9ab" })
    ).toBe(
      [
        "html[data-theme]:not([data-mode=dark]){--color-kumo-brand:#123;--color-kumo-brand-hover:#012;--text-color-kumo-brand:#123;--text-color-kumo-link:#123}",
        "html[data-theme][data-mode=dark]{--color-kumo-brand:#9ab;--color-kumo-brand-hover:#123;--text-color-kumo-brand:#9ab;--text-color-kumo-link:#9ab}",
      ].join("\n")
    );
  });
});

describe(injectAdminTheme, () => {
  it("adds the stylesheet as the last element of <head>", () => {
    expect(
      injectAdminTheme(
        '<html><head><link rel="stylesheet" href="/a.css"></head><body></body></html>',
        "a{b:c}"
      )
    ).toBe(
      '<html><head><link rel="stylesheet" href="/a.css"><style id="site-admin-theme">a{b:c}</style></head><body></body></html>'
    );
  });

  it("returns a document without a head unchanged", () => {
    expect(injectAdminTheme("<p>partial</p>", "a{b:c}")).toBe("<p>partial</p>");
  });
});
