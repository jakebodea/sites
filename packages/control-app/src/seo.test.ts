import { describe, expect, it } from "vitest";

import { internalPath, isProductionOrigin, pageFindings } from "./seo.ts";

type Page = Parameters<typeof pageFindings>[0];

const page = (overrides: Partial<Page> = {}): Page => ({
  canonical: "https://example.com/projects/a",
  description:
    "A description long enough to sit inside the search snippet budget.",
  h1Count: 1,
  images: [],
  invalidJsonLd: 0,
  jsonLdTypes: ["BreadcrumbList"],
  links: [],
  path: "/projects/a",
  robots: "",
  robotsHeader: "",
  status: 200,
  title: "Project A | Example",
  ttfbMs: 100,
  ...overrides,
});

const rules = (facts: Page, production = true): string[] =>
  pageFindings(facts, { origin: "https://example.com", production }).map(
    (item) => item.rule
  );

describe(pageFindings, () => {
  it("passes a well-formed production page", () => {
    expect(rules(page())).toStrictEqual([]);
  });

  it("accepts an empty alt as decorative but flags a missing one", () => {
    const images = [
      { alt: "", sized: true, src: "/a.webp" },
      { alt: null, sized: true, src: "/b.webp" },
    ];
    expect(rules(page({ images }))).toStrictEqual(["image-alt"]);
  });

  it("wants a noindex header on non-production stages", () => {
    expect(rules(page(), false)).toStrictEqual(["preview-noindex"]);
    expect(
      rules(page({ robotsHeader: "noindex, nofollow" }), false)
    ).toStrictEqual([]);
  });

  it("fails production when the stage header says noindex", () => {
    expect(rules(page({ robotsHeader: "noindex" }))).toStrictEqual([
      "indexable",
    ]);
  });

  it("checks content locally without enforcing deployed headers or timing", () => {
    expect(
      pageFindings(page({ robotsHeader: "noindex", ttfbMs: 2000 }), {
        checks: "content",
        origin: "https://example.com",
        production: true,
      })
    ).toStrictEqual([]);
    expect(
      pageFindings(page({ h1Count: 0 }), {
        checks: "content",
        origin: "http://localhost",
        production: false,
      }).map((item) => item.rule)
    ).toStrictEqual(["one-h1"]);
  });

  it("asks deep pages for breadcrumbs and one h1", () => {
    expect(rules(page({ h1Count: 2, jsonLdTypes: [] }))).toStrictEqual([
      "one-h1",
      "breadcrumbs",
    ]);
  });
});

describe("origins", () => {
  it("treats localhost and non-prod workers.dev stages as non-production", () => {
    expect(isProductionOrigin("http://localhost:4591")).toBeFalsy();
    expect(
      isProductionOrigin("https://site-pr-4.acct.workers.dev")
    ).toBeFalsy();
    expect(isProductionOrigin("https://example.com")).toBeTruthy();
    expect(
      isProductionOrigin("https://site-prod.acct.workers.dev")
    ).toBeTruthy();
  });

  it("keeps same-origin paths only", () => {
    expect(internalPath("/contact?x=1#top", "https://example.com")).toBe(
      "/contact"
    );
    expect(
      internalPath("https://other.com/", "https://example.com")
    ).toBeUndefined();
    expect(internalPath("mailto:a@b.c", "https://example.com")).toBeUndefined();
  });
});
