import { describe, expect, it } from "vitest";

import { adminNavCss } from "./nav.ts";

describe(adminNavCss, () => {
  it("hides only the entries a site has not asked for", () => {
    expect(
      adminNavCss([
        "byline-schema",
        "bylines",
        "calendar",
        "categories",
        "import",
        "sections",
        "tags",
        "widgets",
      ])
    ).toBe(
      'html[data-theme] [data-sidebar=menu-item]:has(> :is(a[href="/_emdash/admin/comments"], a[href^="/_emdash/admin/comments?"])){display:none}'
    );
  });

  it("hides the blog features by default", () => {
    const css = adminNavCss();
    expect(css).toContain('a[href="/_emdash/admin/taxonomies/tag"]');
    expect(css).toContain('a[href^="/_emdash/admin/taxonomies/tag?"]');
    expect(css).toContain('a[href="/_emdash/admin/bylines"]');
    expect(css).toContain('a[href="/_emdash/admin/import/wordpress"]');
    expect(css).not.toContain("/_emdash/admin/menus");
  });

  it("adds nothing when a site shows every entry", () => {
    expect(
      adminNavCss([
        "byline-schema",
        "bylines",
        "calendar",
        "categories",
        "comments",
        "import",
        "sections",
        "tags",
        "widgets",
      ])
    ).toBe("");
  });
});
