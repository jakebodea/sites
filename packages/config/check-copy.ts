/**
 * Long-dash check for user-facing copy that oxlint cannot parse: Astro template
 * markup and EmDash seed content. TS/TSX copy is covered by the
 * `local/no-long-dashes` oxlint rule.
 *
 *   bun packages/config/check-copy.ts [root]
 */
import { LONG_DASH } from "./oxlint-plugin-local.ts";

/** Files whose text ends up in front of visitors. */
export const COPY_GLOBS = ["apps/*/src/**/*.astro", "apps/*/seed/*.json"];

export interface DashViolation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

const LONG_DASHES = new RegExp(LONG_DASH.source, "gu");

export const findLongDashes = (
  path: string,
  content: string
): DashViolation[] =>
  content.split("\n").flatMap((text, index) =>
    [...text.matchAll(LONG_DASHES)].map((match) => ({
      column: (match.index ?? 0) + 1,
      line: index + 1,
      path,
    }))
  );

export const checkCopy = async (root: string): Promise<DashViolation[]> => {
  const paths = COPY_GLOBS.flatMap((pattern) => [
    ...new Bun.Glob(pattern).scanSync({ cwd: root }),
  ]).filter((path) => !path.includes("node_modules/"));
  const results = await Promise.all(
    paths.map(async (path) =>
      findLongDashes(path, await Bun.file(`${root}/${path}`).text())
    )
  );
  return results.flat();
};

if (import.meta.main) {
  const violations = await checkCopy(process.argv[2] ?? process.cwd());
  for (const { path, line, column } of violations) {
    process.stderr.write(
      `${path}:${line}:${column}: replace the em/en dash with a hyphen, comma, colon, or parentheses\n`
    );
  }
  process.exitCode = violations.length > 0 ? 1 : 0;
}
