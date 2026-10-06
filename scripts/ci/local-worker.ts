import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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

const text = (value: string) =>
  ({ type: "text", value }) satisfies NonNullable<
    WorkerOptions["config"]["env"]
  >[string];

/** Execute Alchemy's standalone build with disposable, local-only bindings. */
export const localWorker = async (directory: string, cms: boolean) => {
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
    ASSETS: { type: "assets" },
    AXIOM_INGEST_TOKEN: text(""),
    AXIOM_LOGS_DATASET: text(""),
    AXIOM_LOGS_URL: text(""),
    AXIOM_TRACES_DATASET: text(""),
    AXIOM_TRACES_URL: text(""),
    BACKUPS: { name: "local-seo-backups", type: "r2" },
    DB: { id: "local-seo-db", type: "d1" },
    LEAD_NOTIFY_FROM: text(""),
    LEAD_NOTIFY_TO: text(""),
    POSTHOG_HOST: text(""),
    POSTHOG_PROJECT_KEY: text(""),
    POSTHOG_PROXY_PATH: text(""),
    SESSION: { id: "local-seo-session", type: "kv" },
    SITE_ORIGIN: text("http://localhost"),
    STAGE: text("dev-seo"),
    TURNSTILE_SECRET_KEY: text(TURNSTILE_TEST_KEYS.secretKey),
    TURNSTILE_SITE_KEY: text(TURNSTILE_TEST_KEYS.siteKey),
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
    name: "local-seo",
  } satisfies WorkerOptions["config"];
  if (cms) {
    env.IMAGES = { type: "images" };
    env.MEDIA = { name: "local-seo-media", type: "r2" };
  }
  const worker: WorkerOptions = { config };
  if (cms) {
    const mediaBase = readBuildInputs(directory).seedMediaBase;
    if (mediaBase === undefined) {
      throw new Error(
        "Prepare local SEO build inputs before running a CMS audit"
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
  try {
    const url = await runtime.ready;
    url.hostname = "localhost";
    config.env.SITE_ORIGIN = text(url.origin);
    await runtime.setOptions({
      cf: false,
      port: Number(url.port),
      workers: [worker],
    });
    return { origin: url.origin, runtime };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
};
