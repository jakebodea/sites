/**
 * Production-style check: CMS assistant CSS must not ship on public pages.
 * PR #40: a linked assistant stylesheet overrode public `:root` tokens.
 *
 *   bun scripts/ci/public-admin-css-isolation.ts [site]
 *
 * Requires `ASTRO_STANDALONE_BUILD=1 bun run build` for the site first.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { writeBuildInputs } from "@jakebodea/cloudflare-kit/infra";
import { request } from "../../packages/control-app/src/http.ts";

import { LOCAL_CMS_BOOTSTRAP_TOKEN, localWorker } from "./local-worker.ts";
import { seedStage } from "../../packages/control-app/src/seed.ts";

const root = path.resolve(import.meta.dirname, "../..");
const site = process.argv[2] ?? "equityfast";
const directory = path.join(root, "apps", site);

/** Markers that belong in inlined admin assistant CSS, not public HTML or site CSS. */
const ASSISTANT_PUBLIC_MARKERS =
  /assistant\.css|site-assistant|#assistant\/assistant\.css/u;
const KUMO_TOKEN_IN_CSS = /--kumo-/u;

export const publicHtmlViolation = (html: string): string | undefined => {
  if (ASSISTANT_PUBLIC_MARKERS.test(html)) {
    return "public HTML references the CMS assistant stylesheet";
  }
  return undefined;
};

export const publicStylesheetViolation = (css: string): string | undefined => {
  if (KUMO_TOKEN_IN_CSS.test(css)) {
    return "public stylesheet defines Kumo admin tokens";
  }
  return undefined;
};

const stylesheetLinks = (html: string, origin: string): string[] =>
  [...html.matchAll(/\bhref="([^"]+\.css[^"]*)"/gu)].flatMap((match) => {
    const href = match[1];
    return href === undefined ? [] : [new URL(href, origin).href];
  });

const run = async (): Promise<void> => {
  const server = path.join(directory, "dist/server");
  if (!existsSync(server)) {
    throw new Error(
      `${site}: run ASTRO_STANDALONE_BUILD=1 bun run build in apps/${site} first`
    );
  }
  const { site: siteConfig } = await import(
    path.join(directory, "site.config.ts")
  );
  writeBuildInputs(directory, {
    contentDigest: "seed",
    seedMediaBase: siteConfig.localSeedMediaBase,
  });
  const worker = await localWorker(directory, true);
  try {
    const seed = await seedStage(worker.origin, LOCAL_CMS_BOOTSTRAP_TOKEN);
    if (!seed.seeded) {
      throw new Error(`CMS seed failed: ${seed.detail}`);
    }
    const home = await request(`${worker.origin}/`);
    const html = await home.text();
    const htmlViolation = publicHtmlViolation(html);
    if (htmlViolation !== undefined) {
      throw new Error(htmlViolation);
    }
    for (const url of stylesheetLinks(html, worker.origin)) {
      const css = await (await request(url)).text();
      const cssViolation = publicStylesheetViolation(css);
      if (cssViolation !== undefined) {
        throw new Error(`${cssViolation} (${url})`);
      }
    }
  } finally {
    await worker.runtime.dispose();
  }
};

if (import.meta.main) {
  try {
    await run();
    process.stdout.write(`${site}: public admin CSS isolation ok\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
