/// <reference types="astro/client" />

/** Worker bindings and vars, declared in alchemy.run.ts. */
import type { KitEmDashEnv } from "@jakebodea/cloudflare-kit/env";

declare global {
  namespace Cloudflare {
    interface Env extends KitEmDashEnv {
      /** EmDash content (D1). */
      DB: D1Database;
      /** EmDash media library (R2). */
      MEDIA: R2Bucket;
      /** Backup bucket (retained on prod; the daily backup cron runs on prod only). */
      BACKUPS: R2Bucket;
      /** Image resizing for EmDash's `/_image` endpoint. */
      IMAGES: ImagesBinding;
      /** Astro sessions (auto-provisioned by Alchemy). */
      SESSION: KVNamespace;
      /** Cloudflare Email Service; bound once a verified sending domain exists. */
      EMAIL?: SendEmail;
      CF_VERSION_METADATA: { readonly id: string };
      CMS_OWNER_EMAIL: string;
      CMS_OWNER_SITE: string;
      CMS_BOOTSTRAP_TOKEN: string;
      STAGE: string;
      SITE_ORIGIN: string;
      PUBLIC_HTML_CACHE_TTL_SECONDS: string;
      TURNSTILE_SITE_KEY: string;
      TURNSTILE_SECRET_KEY: string;
    }
  }

  type Env = Cloudflare.Env;
}
