import { mkdirSync } from "node:fs";
import path from "node:path";

import { command } from "./command.ts";

const root = path.resolve(import.meta.dirname, "../..");

/** Keep each site's collection state and failed-budget reports together. */
export const lighthouse = async (origin: string, directory: string) => {
  mkdirSync(directory, { recursive: true });
  await command(
    "bunx",
    [
      "@lhci/cli@0.15.1",
      "autorun",
      `--config=${path.join(root, "lighthouserc.json")}`,
      `--upload.outputDir=${directory}`,
      ...["/", "/contact"].map((route) => `--collect.url=${origin}${route}`),
    ],
    directory
  );
};
