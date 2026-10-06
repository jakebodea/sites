import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const root = path.resolve(import.meta.dirname, "../..");

/** Keep the audit's JSON even when its exit status fails the gate. */
export const controlCheck = async (options: {
  name: "seo" | "smoke";
  site: string;
  origin: string;
  output: string;
  flags?: readonly string[];
}) => {
  mkdirSync(options.output, { recursive: true });
  const child = spawn(
    "bun",
    [
      "packages/control-app/src/cli.ts",
      options.name,
      ...(options.flags ?? []),
      "--site",
      options.site,
      "--url",
      options.origin,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let status: number | null = null;
  try {
    const [code] = Schema.decodeUnknownSync(
      Schema.Tuple([Schema.NullOr(Schema.Number), Schema.NullOr(Schema.String)])
    )(await once(child, "close"));
    status = code;
  } catch (error) {
    stderr += `${String(error)}\n`;
  }
  const prefix = path.join(options.output, `${options.site}-${options.name}`);
  writeFileSync(
    `${prefix}.json`,
    stdout || `${JSON.stringify({ error: stderr, status })}\n`
  );
  writeFileSync(`${prefix}.stderr.log`, stderr);
  if (status !== 0) {
    process.stderr.write(
      `${options.site}: ${options.name} failed (exit ${status}); report: ${prefix}.json\n${stdout}${stderr}`
    );
  }
  return status === 0;
};
