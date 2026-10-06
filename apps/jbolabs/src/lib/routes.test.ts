import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { footerNav, primaryNav } from "../content/navigation.ts";
import { ROUTES } from "./routes.ts";

const PAGES = path.join(import.meta.dirname, "../pages");
const routes = new Set<string>(ROUTES);

describe("routes", () => {
  it("lists every page file", () => {
    const pages = readdirSync(PAGES)
      .filter((file) => file.endsWith(".astro") && file !== "404.astro")
      .map((file) =>
        file === "index.astro" ? "/" : `/${file.replace(".astro", "")}`
      );
    expect(pages.toSorted()).toStrictEqual([...ROUTES].toSorted());
  });

  it("links navigation only to real pages", () => {
    const broken = [...primaryNav, ...footerNav].filter(
      (link) => !routes.has(link.href)
    );
    expect(broken).toStrictEqual([]);
  });
});
