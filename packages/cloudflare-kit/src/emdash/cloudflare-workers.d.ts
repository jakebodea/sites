/// <reference types="@cloudflare/workers-types" />
// Minimal shape of the Workers runtime module for this package's own typecheck.
// Sites compile against @cloudflare/workers-types instead.
declare module "cloudflare:workers" {
  export const env: {
    readonly STAGE?: string;
    readonly CMS_OWNER_SITE?: string;
    readonly CMS_BOOTSTRAP_TOKEN?: string;
    readonly PUBLISHED_CONTENT_EXPORT_TOKEN?: string;
  };
}
