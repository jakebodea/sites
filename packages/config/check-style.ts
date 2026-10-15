/**
 * Design rules for site markup that oxlint cannot see: Astro templates and CSS
 * (oxlint reads only `.astro` frontmatter). TSX is scanned too, so one checker
 * owns each rule.
 *
 * - No eyebrows: the small tracked-caps label above a headline. Sections open
 *   with the headline itself. Flags the `eyebrow` class or utility, rendering
 *   an `eyebrow` field or prop, and a tracked-caps line (`uppercase` plus
 *   widened `tracking-*`, or a site utility defined that way) right above a
 *   heading.
 * - Solid top bar: the sticky site header is one opaque color. Blur is fine on
 *   other surfaces, never on the bar or its background layer.
 *
 *   bun packages/config/check-style.ts [root]
 */

/** Site markup and styles. Vendored `components/ui` primitives are included: they render in the header too. */
export const STYLE_GLOBS = [
  "apps/*/src/**/*.astro",
  "apps/*/src/**/*.tsx",
  "apps/*/src/**/*.css",
  "packages/*/src/**/*.tsx",
];

export type StyleRule = "eyebrow" | "top-bar";

export interface StyleViolation {
  readonly path: string;
  readonly line: number;
  readonly rule: StyleRule;
}

export const MESSAGES: Record<StyleRule, string> = {
  eyebrow:
    "remove the eyebrow (a small tracked-caps label over a headline); open the section with the headline itself",
  "top-bar":
    "keep the top bar one solid color: no backdrop blur and no translucent background on the header or its surface layer",
};

/** `eyebrow` as a class token: quoted or space-separated, not `value.eyebrow` or `eyebrow?:`. */
const EYEBROW_CLASS = /(?:^|["'`\s])eyebrow(?=["'`\s]|$)/u;
const EYEBROW_CSS = /(?:@utility\s+eyebrow\b|\.eyebrow\b)/u;
/** `{value.eyebrow && ...}`, `{item.eyebrow}`, `{eyebrow && ...}`: rendering the field is the eyebrow. */
const EYEBROW_FIELD = /\{\s*(?:[\w$]+\.)?eyebrow\s*(?:&&|\}|\?)/u;
const UTILITY = /@utility\s+(?<name>[\w-]+)\s*\{(?<body>[^}]*)\}/gu;
const UPPERCASE = /(?:^|["'`\s:])uppercase(?=["'`\s;]|$)/u;
/** Letter-spacing wider than normal: Tailwind's wide scale, site tokens, or a positive arbitrary value. */
const WIDE_TRACKING =
  /(?:^|["'`\s:])tracking-(?!tight|tighter|normal|\[-)(?:[\w.-]+|\[[^\]]+\])/u;
/** A heading tag, a heading component, or a dynamic `<Heading>`/`<Tag>` element (`as` props). */
const HEADING = /<(?:h[1-6]\b|\w*Head(?:ing|line)\b|Tag\b)|headline-/u;
/** Lines after a tracked-caps label that may hold the heading it sits over. */
const HEADING_WINDOW = 3;

const BACKDROP =
  /backdrop-(?:blur|filter|saturate|brightness)|backdrop-filter\s*:/u;
/** A translucent background with no variant prefix (`hover:bg-white/10` is a state, not the surface). */
const TRANSLUCENT_BG = /(?:^|["'`\s])bg-[a-z][\w-]*\/(?:\d+|\[[^\]]+\])/u;
const HEADER_TAG = /<header\b/u;
const SURFACE_LAYER = /\babsolute\b.*\binset-0\b|\binset-0\b.*\babsolute\b/u;
const TOP_BAR_FILE = /(?:^|\/)site-header\.(?:astro|tsx)$/u;

const violation = (
  path: string,
  index: number,
  rule: StyleRule
): StyleViolation => ({
  line: index + 1,
  path,
  rule,
});

/** Site utilities whose body sets tracked caps (`label-caps`, say): using one reads as `uppercase tracking-*`. */
export const trackedCapsUtilities = (css: string): string[] =>
  [...css.matchAll(UTILITY)].flatMap(({ groups }) => {
    const name = groups?.name ?? "";
    const body = ` ${groups?.body ?? ""}`;
    return name !== "" && UPPERCASE.test(body) && WIDE_TRACKING.test(body)
      ? [name]
      : [];
  });

const hasClassToken = (text: string, names: readonly string[]) =>
  names.some((name) =>
    new RegExp(`(?:^|["'\`\\s:])${name}(?=["'\`\\s]|$)`, "u").test(text)
  );

export const findEyebrows = (
  path: string,
  content: string,
  capsUtilities: readonly string[] = []
): StyleViolation[] => {
  const lines = content.split("\n");
  if (path.endsWith(".css")) {
    return lines.flatMap((text, index) =>
      EYEBROW_CSS.test(text) ? [violation(path, index, "eyebrow")] : []
    );
  }
  return lines.flatMap((text, index) => {
    if (EYEBROW_CLASS.test(text) || EYEBROW_FIELD.test(text)) {
      return [violation(path, index, "eyebrow")];
    }
    const trackedCaps =
      (UPPERCASE.test(text) && WIDE_TRACKING.test(text)) ||
      hasClassToken(text, capsUtilities);
    const following = lines
      .slice(index + 1, index + 1 + HEADING_WINDOW)
      .join("\n");
    return trackedCaps && !HEADING.test(text) && HEADING.test(following)
      ? [violation(path, index, "eyebrow")]
      : [];
  });
};

/** The `<header ...>` opening tag starting at `index`, across lines until its closing `>`. */
const openingTag = (lines: readonly string[], index: number): string => {
  const tag: string[] = [];
  for (const text of lines.slice(index)) {
    tag.push(text);
    if (/(?<!=)>/u.test(text)) {
      break;
    }
  }
  return tag.join(" ");
};

export const findBlurredTopBars = (
  path: string,
  content: string
): StyleViolation[] => {
  const lines = content.split("\n");
  const topBarFile = TOP_BAR_FILE.test(path);
  return lines.flatMap((text, index) => {
    if (HEADER_TAG.test(text)) {
      const tag = openingTag(lines, index);
      if (BACKDROP.test(tag) || TRANSLUCENT_BG.test(tag)) {
        return [violation(path, index, "top-bar")];
      }
    }
    if (!topBarFile) {
      return [];
    }
    const surface = SURFACE_LAYER.test(text) && TRANSLUCENT_BG.test(text);
    return BACKDROP.test(text) || surface
      ? [violation(path, index, "top-bar")]
      : [];
  });
};

export const findStyleViolations = (
  path: string,
  content: string,
  capsUtilities: readonly string[] = []
): StyleViolation[] =>
  [
    ...findEyebrows(path, content, capsUtilities),
    ...findBlurredTopBars(path, content),
  ].toSorted((a, b) => a.line - b.line);

/** `apps/<site>/` or `packages/<name>/`: utilities are defined per site. */
const workspaceOf = (path: string) => path.split("/").slice(0, 2).join("/");

export const checkStyle = async (root: string): Promise<StyleViolation[]> => {
  const paths = STYLE_GLOBS.flatMap((pattern) => [
    ...new Bun.Glob(pattern).scanSync({ cwd: root }),
  ]).filter((path) => !path.includes("node_modules/"));
  const files = await Promise.all(
    paths.map(async (path) => ({
      content: await Bun.file(`${root}/${path}`).text(),
      path,
    }))
  );
  const utilities = new Map<string, string[]>();
  for (const { content, path } of files.filter((file) =>
    file.path.endsWith(".css")
  )) {
    const workspace = workspaceOf(path);
    utilities.set(workspace, [
      ...(utilities.get(workspace) ?? []),
      ...trackedCapsUtilities(content),
    ]);
  }
  return files.flatMap(({ content, path }) =>
    findStyleViolations(path, content, utilities.get(workspaceOf(path)))
  );
};

if (import.meta.main) {
  const violations = await checkStyle(process.argv[2] ?? process.cwd());
  for (const { line, path, rule } of violations) {
    process.stderr.write(`${path}:${line}: ${rule}: ${MESSAGES[rule]}\n`);
  }
  process.exitCode = violations.length > 0 ? 1 : 0;
}
