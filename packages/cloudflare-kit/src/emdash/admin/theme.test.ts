import { describe, expect, it } from "vitest";

import { adminThemeCss, brandAdminCopy, injectAdminTheme } from "./theme.ts";

const theme = {
  brand: "oklch(0.38 0.05 225)",
  brandHover: "oklch(0.24 0.035 230)",
  brandOnDark: "oklch(0.72 0.06 225)",
  canvas: "oklch(0.992 0.002 100)",
};

describe(adminThemeCss, () => {
  it("overrides Kumo's brand tokens for light and dark mode", () => {
    expect(adminThemeCss(theme)).toBe(
      [
        "html[data-theme]:not([data-mode=dark]){--color-kumo-brand:oklch(0.38 0.05 225);--color-kumo-brand-hover:oklch(0.24 0.035 230);--text-color-kumo-brand:oklch(0.38 0.05 225);--text-color-kumo-link:oklch(0.38 0.05 225);--color-kumo-canvas:oklch(0.992 0.002 100);--color-kumo-elevated:oklch(0.992 0.002 100)}",
        "html[data-theme][data-mode=dark]{--color-kumo-brand:oklch(0.72 0.06 225);--color-kumo-brand-hover:oklch(0.38 0.05 225);--text-color-kumo-brand:oklch(0.72 0.06 225);--text-color-kumo-link:oklch(0.72 0.06 225)}",
      ].join("\n")
    );
  });

  it("leaves surfaces alone when a site keeps EmDash's", () => {
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

describe(brandAdminCopy, () => {
  it("welcomes a new editor to the client's site instead of EmDash", () => {
    expect(
      brandAdminCopy(
        '<astro-island props="{&quot;7vQyJA&quot;:[1,[[0,&quot;Welcome to EmDash, &quot;]]]}">',
        'Smith & "Sons"'
      )
    ).toBe(
      '<astro-island props="{&quot;7vQyJA&quot;:[1,[[0,&quot;Welcome to Smith &amp; \\&quot;Sons\\&quot;, &quot;]]]}">'
    );
  });
});
