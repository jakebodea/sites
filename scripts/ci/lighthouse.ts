import { mkdirSync } from "node:fs";
import path from "node:path";

import { command } from "./command.ts";

const root = path.resolve(import.meta.dirname, "../..");

/** Keep each site's collection state and failed-budget reports together. */
export const lighthouse = async (origin: string, directory: string) => {
  mkdirSync(directory, { recursive: true });
  await command(
    path.join(root, "node_modules/.bin/lhci"),
    [
      "autorun",
      `--config=${path.join(root, "lighthouserc.json")}`,
      `--upload.outputDir=${directory}`,
      ...["/", "/contact"].map((route) => `--collect.url=${origin}${route}`),
    ],
    directory
  );
};
