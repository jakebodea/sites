import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ssrPrebundle } from "./ssr-prebundle.ts";

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../.."
);

const cmsSites = readdirSync(path.join(repoRoot, "apps"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((site) =>
    existsSync(path.join(repoRoot, "apps", site, "astro.config.ts"))
  );

describe("site astro.config ssrPrebundle", () => {
  for (const site of cmsSites) {
    it(`${site} lists every SSR dep the helper computes`, async () => {
      const directory = path.join(repoRoot, "apps", site);
      const sourceDirectory = path.join(directory, "src");
      const expected = ssrPrebundle(sourceDirectory);
      const { default: config } = await import(
        path.join(directory, "astro.config.ts")
      );
      const include = config.vite?.ssr?.optimizeDeps?.include;
      expect(include).toStrictEqual(expected);
    });
  }
});
