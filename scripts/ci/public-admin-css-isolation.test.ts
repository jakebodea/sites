import { describe, expect, it } from "vitest";

import {
  publicHtmlViolation,
  publicStylesheetViolation,
} from "./public-admin-css-isolation.ts";

describe(publicHtmlViolation, () => {
  it("flags assistant assets on a public page", () => {
    expect(
      publicHtmlViolation(
        '<link rel="stylesheet" href="/_astro/assistant.css">'
      )
    ).toBe("public HTML references the CMS assistant stylesheet");
  });

  it("allows ordinary site markup", () => {
    expect(
      publicHtmlViolation('<link rel="stylesheet" href="/_astro/index.css">')
    ).toBeUndefined();
  });
});

describe(publicStylesheetViolation, () => {
  it("flags Kumo tokens leaked into a public stylesheet", () => {
    expect(
      publicStylesheetViolation(":root { --kumo-canvas: transparent; }")
    ).toBe("public stylesheet defines Kumo admin tokens");
  });

  it("allows site theme tokens", () => {
    expect(
      publicStylesheetViolation(":root { --color-brand: #112233; }")
    ).toBeUndefined();
  });
});
