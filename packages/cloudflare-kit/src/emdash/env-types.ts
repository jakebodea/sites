/**
 * Writes `emdash-env.d.ts` offline: migrate an in-memory database, apply the
 * site's seed schema, and generate types. EmDash normally writes this file on
 * dev-server start; this makes typechecking work in CI and fresh checkouts.
 *
 *   bun --cwd apps/<site> run types
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Predicate } from "effect";

/** EmDash ships the generator but does not export it; load it by file path. */
const generateTypes = async (projectRoot: string): Promise<string> => {
  const require = createRequire(path.join(projectRoot, "package.json"));
  // `emdash/package.json` is not exported; the main entry lives at `<root>/dist/index.mjs`.
  const emdashRoot = path.resolve(
    path.dirname(require.resolve("emdash")),
    ".."
  );
  const generator = pathToFileURL(
    path.join(emdashRoot, "dist/schema/project-env-types.mjs")
  ).href;
  const module: unknown = await import(generator);
  if (
    !Predicate.hasProperty(module, "generateProjectEnvTypes") ||
    !Predicate.isFunction(module.generateProjectEnvTypes)
  ) {
    throw new TypeError(
      `EmDash no longer exports generateProjectEnvTypes from ${generator}`
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-call -- emdash@1.1.0 exports generateProjectEnvTypes(root): Promise<string>; checked to be a function above.
  const types: unknown = await module.generateProjectEnvTypes(projectRoot);
  if (!Predicate.isString(types)) {
    throw new TypeError("EmDash's type generator returned a non-string");
  }
  return types;
};

export const writeEmDashEnvTypes = async (
  projectRoot: string
): Promise<boolean> => {
  const types = await generateTypes(projectRoot);
  const file = path.join(projectRoot, "emdash-env.d.ts");
  let current = "";
  try {
    current = readFileSync(file, "utf-8");
  } catch {
    current = "";
  }
  if (current === types) {
    return false;
  }
  writeFileSync(file, types);
  return true;
};

if (import.meta.main) {
  const changed = await writeEmDashEnvTypes(process.cwd());
  process.stdout.write(
    changed ? "emdash-env.d.ts updated\n" : "emdash-env.d.ts is current\n"
  );
}
