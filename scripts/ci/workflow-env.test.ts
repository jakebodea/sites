import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const WORKFLOW_REFERENCE =
  /\b(?<kind>vars|secrets)\.(?<name>[A-Za-z_][A-Za-z0-9_]*)\b/gu;

const stackWrites = (path: string, text: string): string[] => {
  const written: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "GitHub"
    ) {
      const kind = node.expression.name.text;
      const [, properties] = node.arguments;
      if (
        (kind === "Variable" || kind === "Secret") &&
        properties !== undefined &&
        ts.isObjectLiteralExpression(properties)
      ) {
        for (const property of properties.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "name" &&
            ts.isStringLiteral(property.initializer)
          ) {
            written.push(
              `${kind === "Variable" ? "vars" : "secrets"}.${property.initializer.text}`
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, text, ts.ScriptTarget.Latest));
  return written;
};
const GITHUB_PROVIDED = new Set(["secrets.GITHUB_TOKEN"]);

const root = new URL("../../", import.meta.url);
const sources = (directory: string, extension: string) => {
  const url = new URL(directory, root);
  return readdirSync(url)
    .filter((name) => name.endsWith(extension))
    .toSorted()
    .map((name) => ({
      path: `${directory}${name}`,
      text: readFileSync(new URL(name, url), "utf-8"),
    }));
};

describe("workflow environment ownership", () => {
  it("has an Alchemy writer for every workflow variable and secret", () => {
    const written = new Set(
      sources("stacks/", ".ts").flatMap(({ path, text }) =>
        stackWrites(path, text)
      )
    );
    const missing = sources(".github/workflows/", ".yml").flatMap(
      ({ path, text }) =>
        [...text.matchAll(WORKFLOW_REFERENCE)].flatMap(([, kind, name]) => {
          const reference = `${kind}.${name}`;
          return written.has(reference) || GITHUB_PROVIDED.has(reference)
            ? []
            : [`${path}: ${reference}`];
        })
    );
    expect(
      [...new Set(missing)].toSorted(),
      `Workflow references without an Alchemy writer in ${fileURLToPath(root)}:\n${missing.join("\n")}`
    ).toStrictEqual([]);
  });
});
