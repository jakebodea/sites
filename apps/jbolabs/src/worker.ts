/**
 * Worker entry. Alchemy's pinned entry is aliased here (`workerEntryAlias` in
 * `@jakebodea/cloudflare-kit/emdash/alchemy-workarounds`), so this wraps
 * Alchemy's Astro handler and adds three site concerns:
 *
 * - the PostHog reverse proxy at the random `POSTHOG_PROXY_PATH`;
 * - the daily backup cron (prod only, where `BACKUPS` is bound);
 * - `X-Robots-Tag: noindex` on every non-prod stage, so previews never get
 *   indexed (a header, not robots.txt, because a Disallow hides the noindex).
 */
import astro from "@alchemy.run/frontend-frameworks/astro/entrypoints/server.js";
import {
  isPostHogProxyRequest,
  proxyPostHog,
  runBackup,
} from "@jakebodea/cloudflare-kit/server";
import { Effect } from "effect";

import { BACKUP_CRON } from "./lib/schedule.ts";

const SWITCHING_PROTOCOLS = 101;

export default {
  async fetch(request, env, ctx) {
    const proxy = { host: env.POSTHOG_HOST, path: env.POSTHOG_PROXY_PATH };
    if (
      env.POSTHOG_PROJECT_KEY !== "" &&
      isPostHogProxyRequest(new URL(request.url), proxy)
    ) {
      return await proxyPostHog(request, proxy);
    }
    const response = await astro.fetch(request, env, ctx);
    if (env.STAGE === "prod" || response.status === SWITCHING_PROTOCOLS) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
  async scheduled(controller, env) {
    if (controller.cron !== BACKUP_CRON || env.STAGE !== "prod") {
      return;
    }
    await Effect.runPromise(
      runBackup({
        backups: env.BACKUPS,
        db: env.DB,
        now: new Date(controller.scheduledTime),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError("backup failed", {
            cause: String(error.cause),
            step: error.step,
          })
        )
      )
    );
  },
} satisfies ExportedHandler<Env>;
