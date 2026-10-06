/**
 * Worker entry. Alchemy's pinned entry is aliased here (see
 * `@jakebodea/cloudflare-kit/emdash/alchemy-workarounds`), so this wraps
 * EmDash's entry and adds two site concerns before Astro runs:
 *
 * - the PostHog reverse proxy at the random `POSTHOG_PROXY_PATH`;
 * - the daily backup cron (prod only, where `BACKUPS` is bound);
 * - `X-Robots-Tag: noindex` on every non-prod stage, so previews never get
 *   indexed (a header, not robots.txt, because a Disallow hides the noindex).
 */
import handler, { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import {
  isPostHogProxyRequest,
  proxyPostHog,
  runBackup,
} from "@jakebodea/cloudflare-kit/server";
import { Effect } from "effect";

import { BACKUP_CRON } from "./lib/schedule.ts";

// EmDash's sandboxed-plugin entrypoint must be exported from the Worker's main module.
export { PluginBridge } from "@emdash-cms/cloudflare/worker";

const emdashScheduled = createScheduledHandler();
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
    const response =
      (await handler.fetch?.(request, env, ctx)) ??
      new Response(null, { status: 404 });
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
  async scheduled(controller, env, ctx) {
    if (controller.cron !== BACKUP_CRON) {
      // Every-minute tick: EmDash's scheduled publishing and maintenance.
      await emdashScheduled(controller, env, ctx);
      return;
    }
    if (env.STAGE === "prod") {
      await Effect.runPromise(
        runBackup({
          backups: env.BACKUPS,
          db: env.DB,
          media: env.MEDIA,
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
    }
  },
} satisfies ExportedHandler<Env>;
