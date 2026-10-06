/// <reference types="astro/client" />

/** Worker bindings and vars, declared in alchemy.run.ts. */
declare namespace Cloudflare {
  interface Env {
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
    STAGE: string;
    SITE_ORIGIN: string;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    LEAD_NOTIFY_FROM: string;
    LEAD_NOTIFY_TO: string;
    POSTHOG_HOST: string;
    POSTHOG_PROJECT_KEY: string;
    POSTHOG_PROXY_PATH: string;
    AXIOM_INGEST_TOKEN: string;
    AXIOM_LOGS_DATASET: string;
    AXIOM_LOGS_URL: string;
    AXIOM_TRACES_DATASET: string;
    AXIOM_TRACES_URL: string;
  }
}

type Env = Cloudflare.Env;
