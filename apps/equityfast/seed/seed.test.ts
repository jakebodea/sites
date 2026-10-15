/**
 * The seed is what a fresh stage (and every preview) starts from, so it must
 * be internally consistent: every image it references ships in `seed/media`,
 * every `$ref` points at a real entry, every menu link resolves to a route,
 * and every English entry has its Spanish translation.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SEED_DIR = import.meta.dirname;
const seedText = readFileSync(path.join(SEED_DIR, "seed.json"), "utf-8");

const MEDIA_URL = /"url":\s*"\/_seed\/media\/(?<file>[^"]+)"/gu;
const REF = /"\$ref:(?<id>[^"]+)"/gu;
const ENTRY_ID = /"id":\s*"(?<id>[a-z0-9-]+)"/gu;
const MENU_URL =
  /"type":\s*"custom",\s*"label":\s*"[^"]*",\s*"url":\s*"(?<url>[^"]+)"/gu;
const SLUG = /"slug":\s*"(?<slug>[a-z0-9-]+)"/gu;
const LOCALE_PREFIX = /^\/(?:es\/)?/u;

/** Content translations point at entry ids; menus use `menu:`/`item:` ids. */
const TRANSLATION_OF = /"translationOf":\s*"(?<id>[a-z0-9-]+)"/gu;

const captures = (pattern: RegExp, group: string): string[] =>
  [...seedText.matchAll(pattern)].flatMap((match) => {
    const value = match.groups?.[group];
    return value === undefined ? [] : [value];
  });

describe("seed/seed.json", () => {
  it("ships every image it references", () => {
    const files = captures(MEDIA_URL, "file");
    expect(files.length).toBeGreaterThan(0);
    const missing = files.filter(
      (file) => !existsSync(path.join(SEED_DIR, "media", file))
    );
    expect(missing).toStrictEqual([]);
  });

  it("only references entries that exist", () => {
    const ids = new Set(captures(ENTRY_ID, "id"));
    const dangling = captures(REF, "id").filter((id) => !ids.has(id));
    expect(dangling).toStrictEqual([]);
  });

  it("links menus to routes the site serves", () => {
    const slugs = new Set(captures(SLUG, "slug"));
    const routes = new Set(["/", "/es", "/apply", "/es/solicitar"]);
    const urls = captures(MENU_URL, "url");
    expect(urls).toContain("/es/calculadora");
    const broken = urls.filter(
      (url) => !routes.has(url) && !slugs.has(url.replace(LOCALE_PREFIX, ""))
    );
    expect(broken).toStrictEqual([]);
  });

  it("translates every English entry into Spanish", () => {
    expect(captures(TRANSLATION_OF, "id")).toStrictEqual([
      "home",
      "page-calculator",
      "page-heloc",
      "page-process",
      "page-about",
      "page-privacy",
      "site-text",
    ]);
  });
});
