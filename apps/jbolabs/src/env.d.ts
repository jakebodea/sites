/// <reference types="astro/client" />

/** Worker bindings and vars, declared in alchemy.run.ts. */
import type { KitEnv } from "@jakebodea/cloudflare-kit/env";

declare global {
  namespace Cloudflare {
    interface Env extends KitEnv {
      /** Intake form leads (D1, see src/lib/leads.ts). */
      DB: D1Database;
      /** Backup bucket (retained on prod; the daily backup cron runs on prod only). */
      BACKUPS: R2Bucket;
      /** Astro sessions (auto-provisioned by Alchemy). */
      SESSION: KVNamespace;
      /** Cloudflare Email Service; bound once a verified sending domain exists. */
      EMAIL?: SendEmail;
      STAGE: string;
      SITE_ORIGIN: string;
      TURNSTILE_SITE_KEY: string;
      TURNSTILE_SECRET_KEY: string;
    }
  }

  type Env = Cloudflare.Env;
}
