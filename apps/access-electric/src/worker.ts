import handler from "@emdash-cms/cloudflare/worker";
import { siteScheduled } from "@jakebodea/cloudflare-kit/emdash/worker";

import { BACKUP_CRON } from "./lib/schedule.ts";

// EmDash's sandboxed-plugin entrypoint must be exported from the Worker's main module.
export { PluginBridge } from "@emdash-cms/cloudflare/worker";

const SWITCHING_PROTOCOLS = 101;

export default {
  async fetch(request, env, ctx) {
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
  scheduled: siteScheduled({ backupCron: BACKUP_CRON }),
} satisfies ExportedHandler<Env>;
