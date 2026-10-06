import { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import { Effect } from "effect";

import type { KitEmDashEnv } from "../env.ts";
import { runBackup } from "../server/backup.ts";
import { syncAnalyticsPluginSettings } from "./analytics.ts";

type SiteEnv = KitEmDashEnv & {
  readonly STAGE: string;
  readonly DB: D1Database;
  readonly MEDIA: R2Bucket;
  readonly BACKUPS: R2Bucket;
};
const emdashScheduled = createScheduledHandler();

export const siteScheduled =
  ({
    backupCron,
  }: {
    readonly backupCron: string;
  }): ExportedHandlerScheduledHandler<SiteEnv> =>
  async (controller, env, ctx) => {
    if (controller.cron !== backupCron) {
      try {
        await syncAnalyticsPluginSettings(env);
      } catch {
        await Effect.runPromise(
          Effect.logError("analytics settings sync failed", {
            step: "settings",
          })
        );
      }
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
  };
