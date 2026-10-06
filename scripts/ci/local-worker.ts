import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  TURNSTILE_TEST_KEYS,
  WORKER_COMPATIBILITY,
  readBuildInputs,
} from "@jakebodea/cloudflare-kit/infra";
import {
  Miniflare,
  Response as WorkerResponse,
  fetch as workerFetch,
} from "miniflare";
import type { WorkerOptions } from "miniflare";

import { REQUEST_TIMEOUT_MS } from "../../packages/control-app/src/http.ts";

const MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
export const LOCAL_CMS_BOOTSTRAP_TOKEN = "local-audit-cms-bootstrap-token-0001";

const text = (value: string) =>
  ({ type: "text", value }) satisfies NonNullable<
    WorkerOptions["config"]["env"]
  >[string];

/** Execute Alchemy's standalone build with disposable, local-only bindings. */
export const localWorker = async (directory: string, cms: boolean) => {
  const scope = `audit-${randomUUID()}`;
  const server = path.join(directory, "dist/server");
  const modules: NonNullable<WorkerOptions["config"]["manifest"]>["modules"] =
    {};
  for (const file of readdirSync(server, {
    encoding: "utf-8",
    recursive: true,
  })) {
    if (file.endsWith(".mjs")) {
      modules[file] = {
        contents: readFileSync(path.join(server, file), "utf-8"),
        type: "esm",
      };
    }
  }
  const env: NonNullable<WorkerOptions["config"]["env"]> = {
    ALERT_EMAIL: text(""),
    ASSETS: { type: "assets" },
    BACKUPS: { name: `${scope}-backups`, type: "r2" },
    CF_ANALYTICS_API_TOKEN: text(""),
    CMS_BOOTSTRAP_TOKEN: text(LOCAL_CMS_BOOTSTRAP_TOKEN),
    CMS_OWNER_EMAIL: text("owner@example.test"),
    CMS_OWNER_SITE: text(path.basename(directory)),
    DB: { id: `${scope}-db`, type: "d1" },
    LEAD_NOTIFY_FROM: text(""),
    LEAD_NOTIFY_FROM_NAME: text(""),
    LEAD_NOTIFY_TO: text(""),
    SESSION: { id: `${scope}-session`, type: "kv" },
    SITE_ORIGIN: text("http://localhost"),
    STAGE: text("dev-seo"),
    TURNSTILE_SECRET_KEY: text(TURNSTILE_TEST_KEYS.secretKey),
    TURNSTILE_SITE_KEY: text(TURNSTILE_TEST_KEYS.siteKey),
    WEB_ANALYTICS_ACCOUNT_ID: text(""),
    WEB_ANALYTICS_HOSTS: text(""),
    WEB_ANALYTICS_SITE_TAG: text(""),
    WEB_ANALYTICS_TOKEN: text(""),
  };
  const config = {
    assets: {
      directory: path.join(directory, "dist/client"),
      hasUserWorker: true,
      runWorkerFirst: true,
    },
    compatibilityDate: WORKER_COMPATIBILITY.date,
    compatibilityFlags: [...WORKER_COMPATIBILITY.flags],
    env,
    manifest: { mainModule: "entry.mjs", modules, modulesRoot: server },
    name: scope,
  } satisfies WorkerOptions["config"];
  if (cms) {
    env.IMAGES = { type: "images" };
    env.MEDIA = { name: `${scope}-media`, type: "r2" };
  }
  const worker: WorkerOptions = { config };
  if (cms) {
    const mediaBase = readBuildInputs(directory).seedMediaBase;
    if (mediaBase === undefined) {
      throw new Error(
        "Prepare local verification build inputs before running a CMS audit"
      );
    }
    const base = new URL(mediaBase.endsWith("/") ? mediaBase : `${mediaBase}/`);
    const mediaDirectory = path.join(directory, "dist/client/_seed/media");
    worker.dev = {
      // EmDash validates a public seed URL; its image bytes come from this build,
      // so CI never depends on a legacy site or an existing preview serving them.
      outboundService: {
        handler: async (request) => {
          const url = new URL(request.url);
          if (
            url.origin === base.origin &&
            url.pathname.startsWith(base.pathname)
          ) {
            const file = path.resolve(
              mediaDirectory,
              decodeURIComponent(url.pathname.slice(base.pathname.length))
            );
            if (path.dirname(file) !== mediaDirectory || !existsSync(file)) {
              return new WorkerResponse("Seed image not found", {
                status: 404,
              });
            }
            return new WorkerResponse(readFileSync(file), {
              headers: {
                "content-type":
                  MEDIA_TYPES.get(path.extname(file)) ??
                  "application/octet-stream",
              },
            });
          }
          return await workerFetch(request, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        },
        type: "fetcher",
      },
    };
  }
  const runtime = new Miniflare({ cf: false, port: 0, workers: [worker] });
  const startup = new AbortController();
  try {
    // Bound the native process boot, separately from EmDash's 180 s migrations.
    return await Promise.race([
      (async () => {
        const url = await runtime.ready;
        url.hostname = "localhost";
        config.env.SITE_ORIGIN = text(url.origin);
        await runtime.setOptions({
          cf: false,
          port: Number(url.port),
          workers: [worker],
        });
        return { origin: url.origin, runtime };
      })(),
      (async () => {
        await delay(30_000, undefined, { signal: startup.signal });
        throw new Error("Local Worker startup exceeded 30 s");
      })(),
    ]);
  } catch (error) {
    await runtime.dispose();
    throw error;
  } finally {
    startup.abort();
  }
};
