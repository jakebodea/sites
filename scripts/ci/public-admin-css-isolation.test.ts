import { describe, expect, it } from "vitest";

import {
  publicHtmlViolation,
  publicStylesheetViolation,
} from "./public-admin-css-isolation.ts";

describe(publicHtmlViolation, () => {
  it("flags assistant assets on a public page but not ordinary stylesheets", () => {
    const dirty = '<link rel="stylesheet" href="/_astro/assistant.css">';
    const clean = '<link rel="stylesheet" href="/_astro/index.css">';
    expect(publicHtmlViolation(dirty)).toBe(
      "public HTML references the CMS assistant stylesheet"
    );
    expect(publicHtmlViolation(clean)).toBeUndefined();
  });
});

describe(publicStylesheetViolation, () => {
  it("flags Kumo tokens in CSS but not site theme tokens", () => {
    const dirty = ":root { --kumo-canvas: transparent; }";
    const clean = ":root { --color-brand: #112233; }";
    expect(publicStylesheetViolation(dirty)).toBe(
      "public stylesheet defines Kumo admin tokens"
    );
    expect(publicStylesheetViolation(clean)).toBeUndefined();
  });
});
