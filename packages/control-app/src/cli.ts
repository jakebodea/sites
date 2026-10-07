#!/usr/bin/env bun
/**
 * `bun run app -- <command>`: drive a marketing site the way a reviewer would,
 * with machine-readable output. See `.agents/skills/control-app/SKILL.md`.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";

import {
  DEFAULT_WIDTHS,
  login,
  record,
  screenshot,
  snapshot,
} from "./browser.ts";
import {
  loadLocalContent,
  parseContentMode,
  prepareProductionContent,
  selectedContent,
  startWithContent,
} from "./content.ts";
import { seedStage } from "./seed.ts";
import { auditSeo, isProductionOrigin } from "./seo.ts";
import { readState, stop, tailLog } from "./server.ts";
import { resolveSite } from "./site.ts";
import type { SiteContext } from "./site.ts";
import { smoke } from "./smoke.ts";

const USAGE = `Usage: bun run app -- <command> [--site <name>] [--url <origin>] [--auth]

  dev                     run alchemy dev in the foreground (humans)
  start --content seed|prod select local content; mode survives restart
  stop | status           manage the background dev server for this worktree
  restart                 stop + start (after server-code edits break hot reload)
  reset --content seed|prod replace local content (seed default, prod reuses validated copy)
  content refresh         fetch production again and replace local content with rollback
  content prepare         prepare a fresh hosted PR production seed (no deploy)
  login                   sign in to the CMS as the dev admin (alchemy dev only)
  screenshot <path...>    full-page PNGs at 1280 and 375 (--widths 1280,768)
  snapshot <path>         accessibility tree as YAML
  record <path>           scroll-through video (--width 375)
  smoke                   pages, 404, admin, images, contact action, cron (--no-submit skips writes)
  seo                     technical SEO audit: titles, descriptions, canonicals, H1s, alt text,
                          image formats, layout shift, breadcrumbs, orphans, redirects, robots.txt
  seed --url <origin>     seed a fresh stage and verify its owner (CMS_BOOTSTRAP_TOKEN required)
  logs [--lines 80]       tail the dev server log

--url targets a deployed stage instead of local dev; --auth reuses the CMS session.
seo --content-only skips deployed indexing headers and response timing.
`;

interface Args {
  readonly command: string | undefined;
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}

const BOOLEAN_FLAGS = new Set(["auth", "content-only", "no-submit"]);

export const parseArgs = (argv: readonly string[]): Args => {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const name = arg.slice(2);
    if (!arg.startsWith("--")) {
      positional.push(arg);
    } else if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, "true");
    } else {
      flags.set(name, argv[index + 1] ?? "");
      index += 1;
    }
  }
  const [command, ...rest] = positional;
  return { command, flags, positional: rest };
};

const print = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

/** Results are JSON so agents can parse them. */
const printJson = (value: Parameters<typeof JSON.stringify>[0]): void => {
  print(JSON.stringify(value, null, 2));
};

const runForeground = async (site: SiteContext): Promise<void> => {
  const child = spawn("bunx", ["alchemy", "dev", "--stage", site.stage], {
    cwd: site.directory,
    stdio: "inherit",
  });
  await once(child, "exit");
};

const widths = (args: Args): number[] => {
  const value = args.flags.get("widths");
  return value === undefined
    ? [...DEFAULT_WIDTHS]
    : value
        .split(",")
        .map(Number)
        .filter((width) => width > 0);
};

type Command = (
  site: SiteContext,
  args: Args,
  origin: string
) => Promise<void> | void;

const argsContent = (args: Args): boolean =>
  parseContentMode(
    args.flags.get("content") ?? process.env.CONTENT_MODE ?? "seed"
  ) === "prod";

const commands = {
  content: async (site, args) => {
    if (args.flags.has("url")) {
      throw new Error("Hosted in-place refresh is not supported");
    }
    if (args.positional[0] === "prepare") {
      await prepareProductionContent(site, true);
      printJson({ prepared: true, site: site.name });
    } else if (args.positional[0] === "refresh") {
      await loadLocalContent(site, "prod", true);
      printJson({ ...readState(site), content: "prod", refreshed: true });
    } else {
      throw new Error("Use content prepare or content refresh");
    }
  },
  dev: async (site) => {
    await runForeground(site);
  },
  login: async (site) => {
    printJson({ session: await login(site) });
  },
  logs: (site, args) => {
    print(tailLog(site, Number(args.flags.get("lines") ?? "80")));
  },
  record: async (site, args, origin) => {
    const video = await record(site, args.positional[0] ?? "/", {
      auth: args.flags.has("auth"),
      origin,
      width: Number(args.flags.get("width") ?? "1280"),
    });
    printJson({ video });
  },
  reset: async (site, args) => {
    if (args.flags.has("url")) {
      throw new Error("Reset only replaces this worktree's local emulator");
    }
    const mode = parseContentMode(args.flags.get("content") ?? "seed");
    await loadLocalContent(site, mode, false);
    const session = site.cms ? await login(site) : undefined;
    printJson({ ...readState(site), content: mode, reset: true, session });
  },
  restart: async (site) => {
    await stop(site);
    await startWithContent(site);
    printJson({ ...readState(site), content: selectedContent(site) });
  },
  screenshot: async (site, args, origin) => {
    const paths = args.positional.length > 0 ? args.positional : ["/"];
    printJson(
      await screenshot(site, paths, {
        auth: args.flags.has("auth"),
        origin,
        widths: widths(args),
      })
    );
  },
  seed: async (site, _args, origin) => {
    const result = site.cms
      ? await seedStage(
          origin,
          process.env.CMS_BOOTSTRAP_TOKEN,
          argsContent(_args)
        )
      : {
          detail: "nothing to do (no CMS: content lives in code)",
          seeded: false,
        };
    printJson(result);
  },
  seo: async (_site, args, origin) => {
    const report = await auditSeo({
      checks: args.flags.has("content-only") ? "content" : "all",
      origin,
      production: isProductionOrigin(origin),
    });
    const errors = report.findings.filter((item) => item.severity === "error");
    const byRule = Object.groupBy(
      report.findings,
      (item) => `${item.severity} ${item.rule}`
    );
    printJson({
      errors: errors.length,
      findings: report.findings,
      pages: report.pages,
      summary: Object.fromEntries(
        Object.entries(byRule).map(([rule, items]) => [
          rule,
          items?.length ?? 0,
        ])
      ),
      warnings: report.findings.length - errors.length,
    });
    if (errors.length > 0) {
      process.exitCode = 1;
    }
  },
  smoke: async (site, args, origin) => {
    const checks = await smoke({
      cms: site.cms,
      local: !args.flags.has("url"),
      origin,
      submit: !args.flags.has("no-submit"),
    });
    const failed = checks.filter((item) => !item.ok);
    printJson({ checks, failed: failed.length, ok: failed.length === 0 });
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  },
  snapshot: async (site, args, origin) => {
    print(
      await snapshot(site, args.positional[0] ?? "/", {
        auth: args.flags.has("auth"),
        origin,
      })
    );
  },
  start: async (site, args) => {
    await startWithContent(site, args.flags.get("content"));
    printJson({ ...readState(site), content: selectedContent(site) });
  },
  status: (site) => {
    const state = readState(site);
    printJson(
      state === undefined
        ? { running: false, stage: site.stage }
        : { running: true, ...state }
    );
  },
  stop: async (site) => {
    printJson({ stopped: await stop(site) });
  },
} satisfies Record<string, Command>;

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const handler = Object.entries(commands).find(
    ([name]) => name === args.command
  )?.[1];
  if (handler === undefined) {
    print(USAGE);
    process.exitCode = args.command === undefined ? 0 : 1;
    return;
  }
  const site = resolveSite(args.flags.get("site"));
  const origin = args.flags.get("url")?.replace(/\/$/u, "") ?? site.origin;
  await handler(site, args, origin);
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `ERROR ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
