import { describe, expect, it } from "vitest";

import { adminAliasTarget } from "./admin-alias.ts";

describe("/_admin alias", () => {
  it.each([
    ["/_admin", "https://example.test/_emdash/admin"],
    ["/_admin/", "https://example.test/_emdash/admin"],
    [
      "/_admin/content/pages",
      "https://example.test/_emdash/admin/content/pages",
    ],
    ["/_admin/login?next=1", "https://example.test/_emdash/admin/login?next=1"],
    ["/_admin//evil.test/x", "https://example.test/_emdash/admin/evil.test/x"],
  ])("sends %s to %s", (path, expected) => {
    expect(adminAliasTarget(new URL(`https://example.test${path}`)).href).toBe(
      expected
    );
  });
});
