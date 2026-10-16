/**
 * Scaffold checks for copied sites: the `alchemy.run.ts` header comment must name
 * this site, not the reference template.
 *
 *   bun packages/config/check-scaffold.ts [root]
 */
import { readdirSync } from "node:fs";
import path from "node:path";

export interface ScaffoldViolation {
  readonly path: string;
  readonly line: number;
  readonly rule: "alchemy-header";
}

const SITE_APPS = /^apps\/[^/]+$/u;

const readSiteIdentity = (
  configPath: string,
  content: string
): { id: string; name: string } | null => {
  const id = /\bid:\s*"([^"]+)"/u.exec(content)?.[1];
  const name = /\bname:\s*"([^"]+)"/u.exec(content)?.[1];
  if (id === undefined || name === undefined) {
    return null;
  }
  return { id, name };
};

/** First `* … infrastructure` line in the stack file header comment. */
export const infrastructureLine = (content: string): string | null => {
  const match = /\/\*\*[\s\S]*?\*\s+(.+?\sinfrastructure)/mu.exec(content);
  return match?.[1] ?? null;
};

export const headerMatchesSite = (
  line: string,
  identity: { id: string; name: string }
): boolean => {
  const haystack = line.toLowerCase();
  const idPhrase = identity.id.replaceAll("-", " ").toLowerCase();
  const name = identity.name.toLowerCase();
  return haystack.includes(idPhrase) || haystack.includes(name);
};

export const findScaffoldViolations = (
  siteDir: string,
  siteConfig: string,
  alchemy: string
): ScaffoldViolation[] => {
  const identity = readSiteIdentity(siteDir, siteConfig);
  const line = infrastructureLine(alchemy);
  if (identity === null || line === null) {
    return [];
  }
  if (headerMatchesSite(line, identity)) {
    return [];
  }
  const lineNumber =
    alchemy.slice(0, alchemy.indexOf(line)).split("\n").length;
  return [
    {
      line: lineNumber,
      path: `${siteDir}/alchemy.run.ts`,
      rule: "alchemy-header",
    },
  ];
};

export const checkScaffold = async (root: string): Promise<ScaffoldViolation[]> => {
  const appsDir = path.join(root, "apps");
  const sites = readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}`)
    .filter((site) => SITE_APPS.test(site));

  const results = await Promise.all(
    sites.map(async (site) => {
      const configPath = path.join(root, site, "site.config.ts");
      const alchemyPath = path.join(root, site, "alchemy.run.ts");
      const [siteConfig, alchemy] = await Promise.all([
        Bun.file(configPath).text(),
        Bun.file(alchemyPath).text(),
      ]);
      return findScaffoldViolations(site, siteConfig, alchemy);
    })
  );
  return results.flat();
};

if (import.meta.main) {
  const violations = await checkScaffold(process.argv[2] ?? process.cwd());
  for (const { path: file, line } of violations) {
    process.stderr.write(
      `${file}:${line}: name this site in the alchemy.run.ts header (match site.config id or name)\n`
    );
  }
  process.exit(violations.length === 0 ? 0 : 1);
}
