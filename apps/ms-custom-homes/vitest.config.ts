import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["seed/**/*.test.ts", "src/**/*.test.ts"] },
});
