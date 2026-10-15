import { describe, expect, it } from "vitest";

import {
  findBlurredTopBars,
  findEyebrows,
  trackedCapsUtilities,
} from "./check-style";

describe(findEyebrows, () => {
  it("flags the eyebrow class and rendering an eyebrow field", () => {
    const content = [
      '<p class="eyebrow text-gold">Interactive tool</p>',
      "<h1>Renovation planner</h1>",
      "{value.eyebrow && <span>{value.eyebrow}</span>}",
      '<p className={cn("eyebrow", tone)}>Plan</p>',
    ].join("\n");
    expect(findEyebrows("block.astro", content)).toStrictEqual([
      { line: 1, path: "block.astro", rule: "eyebrow" },
      { line: 3, path: "block.astro", rule: "eyebrow" },
      { line: 4, path: "block.astro", rule: "eyebrow" },
    ]);
  });

  it("flags tracked caps right above a heading, inline or through a site utility", () => {
    const content = [
      '<p class="text-xs tracking-[0.2em] uppercase">Our work</p>',
      '<h2 class="text-4xl">Portfolio</h2>',
      '<p class="label-caps mb-6">Financing</p>',
      "<Headline text={value.headline} />",
      '<p class="label-caps text-brand">Custom home</p>',
      '<Heading class="text-2xl">{project.title}</Heading>',
    ].join("\n");
    expect(findEyebrows("block.astro", content, ["label-caps"])).toStrictEqual([
      { line: 1, path: "block.astro", rule: "eyebrow" },
      { line: 3, path: "block.astro", rule: "eyebrow" },
      { line: 5, path: "block.astro", rule: "eyebrow" },
    ]);
  });

  it("allows tracked caps that do not label a heading, and eyebrow as a word in code", () => {
    const content = [
      '<h1 class="uppercase tracking-tight">Title</h1>',
      '<a class="label-caps px-4">Contact</a>',
      '<span class="uppercase tracking-wide">ES</span>',
      "const { eyebrow: unused } = props;",
    ].join("\n");
    expect(findEyebrows("nav.astro", content, ["label-caps"])).toStrictEqual(
      []
    );
    expect(findEyebrows("x.astro", '<p class="eyebrow">x</p>')).toStrictEqual([
      { line: 1, path: "x.astro", rule: "eyebrow" },
    ]);
  });

  it("flags an eyebrow utility in CSS", () => {
    const css =
      "@utility eyebrow {\n  @apply uppercase;\n}\n.eyebrow::before {}";
    expect(findEyebrows("global.css", css)).toStrictEqual([
      { line: 1, path: "global.css", rule: "eyebrow" },
      { line: 4, path: "global.css", rule: "eyebrow" },
    ]);
  });
});

describe(trackedCapsUtilities, () => {
  it("names the utilities that set uppercase with widened tracking", () => {
    const css = [
      "@utility label-caps { @apply text-xs tracking-[0.22em] uppercase; }",
      "@utility caps-tight { @apply uppercase tracking-tight; }",
      "@utility container-page { @apply mx-auto px-5; }",
    ].join("\n");
    expect(trackedCapsUtilities(css)).toStrictEqual(["label-caps"]);
  });
});

describe(findBlurredTopBars, () => {
  it("flags blur and a translucent background on a header tag in any file", () => {
    const content = [
      '<header class="sticky top-0 bg-background/95 backdrop-blur">',
      '<header class="sticky top-0 bg-navy-deep/80">',
    ].join("\n");
    expect(findBlurredTopBars("layout.astro", content)).toStrictEqual([
      { line: 1, path: "layout.astro", rule: "top-bar" },
      { line: 2, path: "layout.astro", rule: "top-bar" },
    ]);
  });

  it("flags blur anywhere in the site header and a translucent surface layer", () => {
    const content = [
      "<header",
      '  class="sticky top-0 z-40"',
      ">",
      '  <div class="header-surface absolute inset-0 -z-10 bg-background/92"></div>',
      '  <nav class="backdrop-blur-md">',
    ].join("\n");
    expect(
      findBlurredTopBars("apps/x/src/components/site-header.astro", content)
    ).toStrictEqual([
      {
        line: 4,
        path: "apps/x/src/components/site-header.astro",
        rule: "top-bar",
      },
      {
        line: 5,
        path: "apps/x/src/components/site-header.astro",
        rule: "top-bar",
      },
    ]);
  });

  it("allows a solid bar, state tints inside it, and blur on other surfaces", () => {
    const header = [
      '<header class="sticky top-0 border-b border-white/10 bg-navy-deep">',
      '  <a class="hover:bg-white/10 aria-[current=page]:bg-white/10">Home</a>',
      "</header>",
    ].join("\n");
    expect(
      findBlurredTopBars("apps/x/src/components/site-header.astro", header)
    ).toStrictEqual([]);
    expect(
      findBlurredTopBars(
        "apps/x/src/components/blocks/hero.astro",
        '<div class="rounded-3xl bg-white/6 backdrop-blur-xl"></div>'
      )
    ).toStrictEqual([]);
  });
});
