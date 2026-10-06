import { defineConfig } from "vitest/config";

// Root-level scripts only; each workspace package runs its own tests through turbo.
export default defineConfig({
  test: { include: ["scripts/**/*.test.ts"], passWithNoTests: true },
});
