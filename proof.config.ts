/**
 * Proof policy for this repository (`bun run proof`). Risk follows blast
 * radius: copy and docs are low; site code is medium and needs visual
 * evidence; server paths and dependencies are high; infrastructure, CI, and
 * the EmDash-on-Alchemy workarounds are critical. See docs/proof.md.
 */
import { defineProofConfig } from "@jakebodea/proof/config";

export default defineProofConfig({
  gates: {
    build: { command: ["bun", "run", "build"] },
    ci: { command: ["bun", "run", "ci"] },
  },
  risk: {
    critical: [
      /^\.github\//u,
      /^stacks\//u,
      /(?:^|\/)alchemy\.run\.ts$/u,
      /^packages\/cloudflare-kit\/src\/(?:infra|emdash)\//u,
      /^apps\/[^/]+\/src\/worker\.ts$/u,
      /^apps\/[^/]+\/astro\.config\.ts$/u,
    ],
    high: [
      /^packages\/cloudflare-kit\/src\/server\//u,
      /^apps\/[^/]+\/src\/(?:actions|lib\/server)/u,
      /(?:^|\/)package\.json$/u,
      /^bun\.lock$/u,
      /^apps\/[^/]+\/seed\//u,
    ],
    medium: [
      /^apps\//u,
      /^packages\//u,
      /^scripts\//u,
      /^turbo\.json$/u,
      /^proof\.config\.ts$/u,
    ],
  },
  visual: [
    /^apps\/[^/]+\/src\/.+\.(?:astro|tsx|css)$/u,
    /^apps\/[^/]+\/public\//u,
    /^apps\/[^/]+\/seed\//u,
  ],
  visualExempt: [/\.test\.tsx?$/u],
});
