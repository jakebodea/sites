import path from "node:path";

import { describe, expect, it } from "vitest";

import { pathSlug, pickSite } from "./site.ts";
import { sitemapLocations } from "./sitemap.ts";

describe(pickSite, () => {
  const sites = ["access-electric", "ms-homes"];

  it("prefers an explicit site", () => {
    expect(pickSite(sites, "ms-homes", "")).toBe("ms-homes");
  });

  it("uses the app the command runs inside", () => {
    expect(
      pickSite(sites, undefined, path.join("apps", "ms-homes", "src"))
    ).toBe("ms-homes");
  });

  it("falls back to the only site", () => {
    expect(pickSite(["access-electric"], undefined, "")).toBe(
      "access-electric"
    );
  });

  it("refuses to guess between several sites", () => {
    expect(() => pickSite(sites, undefined, "")).toThrow("--site");
    expect(() => pickSite(sites, "nope", "")).toThrow("Unknown site");
  });
});

describe(pathSlug, () => {
  it("makes file-name-safe slugs", () => {
    expect(pathSlug("/")).toBe("home");
    expect(pathSlug("/portfolio/schools/")).toBe("portfolio-schools");
  });
});

describe(sitemapLocations, () => {
  it("reads every loc", () => {
    const xml =
      "<urlset><url><loc>https://x.dev/</loc></url><url><loc> https://x.dev/about </loc></url></urlset>";
    expect(sitemapLocations(xml)).toStrictEqual([
      "https://x.dev/",
      "https://x.dev/about",
    ]);
  });
});
