import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AstroUserConfig } from "astro";
import { describe, expect, it } from "vitest";

import { ssrPrebundle } from "./ssr-prebundle.ts";

const repoRoot = path.join(import.meta.dirname, "../../../..");
const siteApps = ["access-electric", "equityfast", "ms-custom-homes"] as const;

describe("site astro.config ssrPrebundle", () => {
  it.each(siteApps)("%s lists every SSR dep the helper computes", async (site) => {
    const directory = path.join(repoRoot, "apps", site);
    const sourceDirectory = path.join(directory, "src");
    const expected = ssrPrebundle(sourceDirectory);
    const module = (await import(
      pathToFileURL(path.join(directory, "astro.config.ts")).href
    )) as { default: AstroUserConfig };
    const include = module.default.vite?.ssr?.optimizeDeps?.include;
    expect(include).toStrictEqual(expected);
  });
});
