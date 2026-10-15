import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lucideIconImports } from "./ssr-prebundle.ts";

const sourceTree = (files: Record<string, string>): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "ssr-prebundle-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }
  return directory;
};

describe(lucideIconImports, () => {
  it("lists each icon a site imports once, from any depth", () => {
    const directory = sourceTree({
      "components/Hero.astro":
        'import ArrowRight from "@lucide/astro/icons/arrow-right";\nimport Check from "@lucide/astro/icons/check";',
      "pages/index.astro":
        'import ArrowRight from "@lucide/astro/icons/arrow-right";',
      "styles/site.css": '/* "@lucide/astro/icons/zap" */',
    });
    expect(lucideIconImports(directory)).toStrictEqual([
      "@lucide/astro/icons/arrow-right",
      "@lucide/astro/icons/check",
    ]);
  });
});
