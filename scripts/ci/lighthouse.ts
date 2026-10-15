import { mkdirSync } from "node:fs";
import path from "node:path";

import { command } from "./command.ts";

const root = path.resolve(import.meta.dirname, "../..");

/**
 * Audit the home page and the lead form's page. Keep each site's collection
 * state and failed-budget reports together.
 */
export const lighthouse = async (
  origin: string,
  formPage: string,
  directory: string
) => {
  mkdirSync(directory, { recursive: true });
  await command(
    path.join(root, "node_modules/.bin/lhci"),
    [
      "autorun",
      `--config=${path.join(root, "lighthouserc.json")}`,
      `--upload.outputDir=${directory}`,
      ...["/", formPage].map((route) => `--collect.url=${origin}${route}`),
    ],
    directory
  );
};
