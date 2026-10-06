# 1. Client-site analytics and alerting: Cloudflare Web Analytics, no PostHog or Axiom

- Status: accepted
- Date: 2026-10-06

## Context

Client sites are low-traffic brochure sites. What the people involved need from them:

1. **Traffic**: page views, top pages, referrers, countries. Clients want to see their own.
2. **Leads**: already stored in D1 (with source page and referrer) and emailed to the client.
3. **An alert when the contact form breaks**, because a lost enquiry is the one failure that costs money.

The stack had grown heavier than that:

- **PostHog** (browser SDK, a same-Worker reverse proxy, a server `Analytics` service, an event allowlist). Its free plan allows 1 project and pay-as-you-go 6; unlimited projects cost $250/month. One project per site does not scale to many clients, one shared project mixes every client's data, and a client cannot be given access to only their own site.
- **Axiom** (datasets, an ingest token, a log destination, and monitors per site). An unset token broke the first jbolabs prod deploy.
- Neither PostHog nor Axiom objects were managed as code, which breaks the rule that every resource lives in Alchemy.

## Decision

**Everything runs through Alchemy.** A service without an Alchemy provider gets a custom one built on its `@distilled.cloud/*` package (pattern: [executor v2](https://github.com/UsefulSoftwareCo/executor/tree/v2/apps/hosted/cloud/src/infrastructure)). This ADR removes the need for one on client sites.

For client sites:

| Need | Solution | Managed by |
| --- | --- | --- |
| Traffic | **Cloudflare Web Analytics**: a `Cloudflare.Rum.Site` per site on prod, beacon embedded by the layout. Cookieless, no consent banner, free for unlimited sites | site `alchemy.run.ts` |
| Client-facing stats | **[`@eisbachcode/emdash-plugin-analytics`](https://github.com/eisbachcode/emdash-plugin-analytics)** in the EmDash admin: traffic card, 7/30/90-day page, referrers, countries, views per entry. The client sees only their own site, behind the CMS login they already have | the Worker writes the plugin's settings from its bindings (below) |
| Analytics API access | One account-owned Cloudflare token with **Account Analytics Read** only, written to the `production` GitHub environment | `stacks/github.ts` |
| Contact-form failures | The Worker **emails `ALERT_EMAIL`** through Cloudflare Email Service (`reportLeadFailure`) | site stack + `stacks/github.ts` |
| Debugging | Workers Logs and traces, every stage | `siteObservability` |

**Plugin settings come from code, not the settings form.** The plugin reads its token, account ID and site tag from EmDash's plugin settings. The site Worker writes them on its every-minute cron from bindings Alchemy provides (`encryptPluginSetting` + `OptionsRepository`, both public EmDash exports), so nothing is pasted by hand and a redeploy restores them. Edits in the form are overwritten; code is the source of truth.

**PostHog stays the default for products** (funnels, replay, flags, experiments), managed through a custom Alchemy provider on `@distilled.cloud/posthog` when the first product needs it. The removed browser/server/proxy modules are in git history (`packages/cloudflare-kit/src/{analytics,server/analytics.ts,server/posthog-proxy.ts}`).

## Consequences

- Client sites ship less JavaScript (no PostHog SDK), and the Worker has no analytics proxy.
- No custom events: we lose "contact form started" style funnels on client sites. Lead counts and sources come from D1.
- The analytics plugin is young (0.3.x, one maintainer, MIT). If it is abandoned we fork it; the Cloudflare data stays ours either way.
- The plugin's scheduled sync needs more than Workers Free's 10 ms CPU per cron run: the account must be on **Workers Paid**.
- Plugin secrets need `EMDASH_ENCRYPTION_KEY`, generated per stage with `Alchemy.Random`.
- The failure alert is only emailed once the site has a verified sender (`EMAIL_FROM`); until then it is logged, like lead notifications.
- jbolabs has no CMS: it gets the Web Analytics beacon and the failure alert, and its stats live in the Cloudflare dashboard.
