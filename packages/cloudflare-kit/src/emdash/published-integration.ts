import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import {
  readBuildInputs,
  publishedContentDigest,
} from "../infra/build-inputs.ts";
import {
  COMPLETION_PATH,
  EXPORT_PATH,
  decodePlan,
} from "./published-content.ts";
import type { FreshPlan } from "./published-content.ts";

export const CONTENT_PLAN_FILE = ".published-content.json";
/** A stamped production build cannot silently fall back or consume a different cached bundle. */
export const readPublishedPlan = (root: string): FreshPlan | null => {
  const expected = readBuildInputs(root).contentDigest;
  if (expected === undefined || expected === "seed") {
    return null;
  }
  if (publishedContentDigest(root, true) !== expected) {
    throw new Error(
      "Published content build stamp does not match the prepared plan"
    );
  }
  return decodePlan(
    JSON.parse(readFileSync(path.join(root, CONTENT_PLAN_FILE), "utf-8"))
  );
};
export const publishedContent = (): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ config, injectRoute, updateConfig }) => {
      const plan = readPublishedPlan(fileURLToPath(config.root));
      injectRoute({
        entrypoint: "@jakebodea/cloudflare-kit/emdash/published-route",
        pattern: EXPORT_PATH,
        prerender: false,
      });
      injectRoute({
        entrypoint:
          "@jakebodea/cloudflare-kit/emdash/published-completion-route",
        pattern: COMPLETION_PATH,
        prerender: false,
      });
      updateConfig({
        vite: {
          plugins: [
            {
              load: (id) =>
                id === "\0virtual:published-content"
                  ? `export default ${JSON.stringify(plan)}`
                  : undefined,
              name: "published-plan",
              resolveId: (id) =>
                id === "virtual:published-content"
                  ? "\0virtual:published-content"
                  : undefined,
            },
          ],
        },
      });
    },
  },
  name: "published-content",
});
