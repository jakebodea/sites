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
import { seedStage } from "./seed.ts";
import { auditSeo, isProductionOrigin } from "./seo.ts";
import {
  readState,
  restoreSeedSnapshot,
  saveSeedSnapshot,
  start,
  stop,
  tailLog,
  wipeLocalState,
} from "./server.ts";
import { resolveSite } from "./site.ts";
import type { SiteContext } from "./site.ts";
import { smoke } from "./smoke.ts";

const USAGE = `Usage: bun run app -- <command> [--site <name>] [--url <origin>] [--auth]

  dev                     run alchemy dev in the foreground (humans)
  start | stop | status   manage the background dev server for this worktree
  restart                 stop + start (after server-code edits break hot reload)
  reset                   wipe local D1/R2/KV, restart, and sign in (fresh seeded site)
  login                   sign in to the CMS as the dev admin (alchemy dev only)
  screenshot <path...>    full-page PNGs at 1280 and 375 (--widths 1280,768)
  snapshot <path>         accessibility tree as YAML
  record <path>           scroll-through video (--width 375)
  smoke                   pages, 404, admin, images, contact action, cron
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

const BOOLEAN_FLAGS = new Set(["auth", "content-only"]);

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

const commands = {
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
  reset: async (site) => {
    await wipeLocalState(site);
    if (!site.cms) {
      // Nothing to seed or sign in to: a fresh, empty local database is the reset.
      printJson({ ...(await start(site)), restored: false });
      return;
    }
    const restored = restoreSeedSnapshot(site);
    await start(site);
    // Needs the running server. The dev bypass seeds an empty site, then signs in; on a
    // restored snapshot it only signs in.
    const session = await login(site);
    if (!restored) {
      await stop(site);
      saveSeedSnapshot(site);
      await start(site);
    }
    printJson({ ...readState(site), restored, session });
  },
  restart: async (site) => {
    await stop(site);
    printJson(await start(site));
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
      ? await seedStage(origin)
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
  start: async (site) => {
    printJson(await start(site));
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
