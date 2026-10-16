import path from "node:path";
import { pathToFileURL } from "node:url";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ssrPrebundle } from "./ssr-prebundle.ts";

const repoRoot = path.join(import.meta.dirname, "../../../..");
const siteApps = ["access-electric", "equityfast", "ms-custom-homes"] as const;

const AstroConfigModule = Schema.Struct({
  default: Schema.Struct({
    vite: Schema.optional(
      Schema.Struct({
        ssr: Schema.optional(
          Schema.Struct({
            optimizeDeps: Schema.optional(
              Schema.Struct({
                include: Schema.optional(Schema.Array(Schema.String)),
              })
            ),
          })
        ),
      })
    ),
  }),
});

describe("site astro.config ssrPrebundle", () => {
  for (const site of siteApps) {
    // Dynamic `import()` of each site's astro.config can exceed 5s on CI runners.
    it(
      `${site} lists every SSR dep the helper computes`,
      { timeout: 15_000 },
      async () => {
        const directory = path.join(repoRoot, "apps", site);
        const sourceDirectory = path.join(directory, "src");
        const expected = ssrPrebundle(sourceDirectory);
        const loaded = Schema.decodeUnknownSync(AstroConfigModule)(
          await import(
            pathToFileURL(path.join(directory, "astro.config.ts")).href
          )
        );
        expect(loaded.default.vite?.ssr?.optimizeDeps?.include).toStrictEqual(
          expected
        );
      }
    );
  }
});
