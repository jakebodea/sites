# Cloudflare kit

Shared server services, Alchemy helpers, and EmDash integration for marketing sites.

## Analytics and alerts

Spread `yield* webAnalytics(stage)` and `leadMail(stage, { emailFrom, inbox, fromName, alertInbox })` into the Worker bindings in `alchemy.run.ts`. CMS sites also spread `yield* emdashSecrets`. Declare bindings with `KitEnv` or `KitEmDashEnv` from `./env`.

Render the prop-less `./astro/web-analytics-beacon.astro` in the public layout. Only prod's canonical hostname and its `www` form measure traffic. The stage helpers supply empty bindings on dev and preview.

CMS sites register `analyticsPlugin` from `./emdash/analytics` in `emdash({ plugins })` and declare the catalog-pinned plugin dependency so EmDash's generated module can resolve its sandbox entrypoint. Use `siteScheduled({ backupCron })` from `./emdash/worker`. It reconciles changed analytics settings before EmDash's scheduled tasks; dev and preview use demo data. Tokens are encrypted, compared by plaintext, and rewritten after key rotation. Do not paste credentials into the plugin settings form.

Contact actions decode their site schema and call `submitContact` with `sourcePath`, `requestId` from `cf-ray` or `crypto.randomUUID()`, and optional `remoteIp`. Merge `LeadMailFromConfig` and `emailFromEnv(env.EMAIL)` into the contact layer with Turnstile and the site's lead store. The pipeline owns alert policy. Turnstile outages, save failures, and defects alert; rejected visitors do not. Inbox delivery failure logs and still succeeds because the lead is saved.

`stacks/github.ts` provisions the production Account Analytics Read token. Site stacks pass the committed studio sender and alert inbox plus their client inbox and display name to `leadMail`. Setting the verified `studio.sender` enables mail; otherwise failed leads remain recoverable in Workers Logs.

See [ADR 0001](../../docs/adr/0001-client-site-analytics-and-alerting.md).
