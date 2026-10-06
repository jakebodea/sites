# 1. Client-site analytics and alerting: Cloudflare Web Analytics, no PostHog or Axiom

- Status: accepted
- Date: 2026-10-06

## Context

Client sites are low-traffic brochure sites. The people involved need three things from them:

1. **Traffic**: page views, top pages, referrers, and countries. Clients want to see their own.
2. **Leads**: already stored in D1, with the source page and referrer, and emailed to the client.
3. **An alert when the contact form breaks**, because a lost enquiry is the one failure that costs money.

The stack had grown heavier than that:

- **PostHog**: a browser SDK, a same-Worker reverse proxy, a server `Analytics` service, and an event allowlist. Its free plan allows 1 project and pay-as-you-go allows 6. Unlimited projects cost $250/month. One project per site does not scale to many clients, one shared project mixes every client's data, and PostHog cannot give a client access to only their own site.
- **Axiom**: datasets, an ingest token, a log destination, and monitors per site. An unset token broke the first jbolabs prod deploy.
- Neither PostHog nor Axiom objects were managed as code, which breaks the rule that every resource lives in Alchemy.

## Decision

**Everything runs through Alchemy.** A service without an Alchemy provider gets a custom one built on its `@distilled.cloud/*` package, following the [executor v2 providers](https://github.com/UsefulSoftwareCo/executor/tree/v2/apps/hosted/cloud/src/infrastructure). This decision removes the need for one on client sites.

| Need | Solution | Managed by |
| --- | --- | --- |
| Traffic | **Cloudflare Web Analytics**: one `Cloudflare.Rum.Site` per site on prod, with the beacon in the layout. Cookieless, no consent banner, free for unlimited sites. | site `alchemy.run.ts` |
| Client-facing stats | **[`@eisbachcode/emdash-plugin-analytics`](https://github.com/eisbachcode/emdash-plugin-analytics)** in the EmDash admin: a traffic card, a 7, 30, or 90-day page, referrers, countries, and views per entry. The client sees only their own site, behind the CMS login they already have. | the Worker, from its bindings |
| Analytics API access | One account-owned Cloudflare token with only **Account Analytics Read**, written to the `production` GitHub environment. | `stacks/github.ts` |
| Contact-form failures | The contact pipeline **emails `ALERT_EMAIL`** through Cloudflare Email Service. | the kit, `stacks/github.ts` |
| Debugging | Workers Logs and traces on every stage. | `siteObservability` |

**Plugin settings come from code, not the settings form.** The plugin reads its token, account ID, and site tag only from EmDash's plugin settings. The site Worker writes them on its every-minute cron from bindings Alchemy provides, so nobody pastes a value and a reset database refills itself. The Worker overwrites edits made in the form. Code is the source of truth.

**PostHog stays the default for products**: funnels, replay, flags, and experiments. A product manages it through a custom Alchemy provider on `@distilled.cloud/posthog`. The removed client-site browser, server, and proxy modules are in git history under `packages/cloudflare-kit/src/analytics`, `server/analytics.ts`, and `server/posthog-proxy.ts`.

## Design

Each concern crosses three boundaries: a deploy-time resource or secret, a Worker binding, and runtime code. The kit owns every crossing, so a site that copies the reference site gets the policy right without reading it.

| Module in `packages/cloudflare-kit/src` | Owns |
| --- | --- |
| `env.ts` | The binding contract (`KitEnv`, `KitEmDashEnv`). Site `env.d.ts` files extend it, and each stack helper's return type is checked against it, so a renamed binding fails `tsc`. |
| `infra/web-analytics.ts` | `webAnalytics(stage)`. On prod it creates the `Rum.Site` and binds its token, tag, account, and hosts. Everywhere else it binds empty strings. |
| `infra/lead-mail.ts` | `leadMail(stage, emailFrom)`. Binds the lead inbox and, on prod only, `ALERT_EMAIL` as a secret. |
| `infra/emdash-secrets.ts` | `emdashSecrets`. Turns a 32-byte `Alchemy.Random` into the `emdash_enc_v1_` base64url key EmDash requires. |
| `web-analytics.ts` | `webAnalyticsFromEnv`, the only code that reads "empty means off". |
| `astro/web-analytics-beacon.astro` | The beacon. It renders only on prod, and only on the origin hostname or its `www` form, so a `workers.dev` alias is not counted twice. |
| `emdash/analytics.ts` | The plugin re-export and the settings reconciler. |
| `emdash/worker.ts` | `siteScheduled`, the EmDash sites' whole `scheduled` handler. |
| `server/contact.ts` | Which contact failures alert, and the alert email. |

**The reconciler writes only what differs.** It reads the five option rows, compares plain values, and decrypts the stored token to compare plaintext. AES-GCM output changes on every encryption, so comparing ciphertext would rewrite the token every minute. A stored token encrypted with an older key is rewritten. A fresh database without the options table returns `NotReady`, and the next tick retries. Dev and preview stages get the plugin's demo provider, so the admin renders and can be verified locally without calling Cloudflare.

**Analytics never blocks publishing.** `siteScheduled` awaits the settings sync, logs its failure without the error body, then runs EmDash's minute tick either way.

**The alert fires only when a lead may be lost.** `TurnstileUnavailable`, `LeadNotSaved`, and defects alert. Schema errors and `TurnstileRejected` do not, because the visitor can fix them in the form. A failed inbox notification after the save only logs, because the lead is already in the CMS. Every alert is logged with the lead details and a `requestId`, which is the recovery path until the site has a verified sender.

## Alternatives considered

Three models drafted designs independently with `/architect`, and a fourth judged them. The base design came from the candidate that put every binding name behind one typed contract. The others contributed the plaintext comparison with key rotation, the `requestId`, and the beacon's hostname check.

- **Per-site wiring with kit primitives only.** This is the smallest kit, but every site repeats the prod-only rule, the binding names, and the encryption details. That is why removing PostHog touched about 15 files.
- **Writing plugin settings at deploy time** with an Alchemy resource that runs SQL against D1. This converges cleanly, but it writes site data from outside the site, which the repo forbids, and a reset would lose the settings until the next deploy.
- **A kit plugin that sets the analytics plugin's options from its own hooks.** This would need cross-plugin option writes and plugin-host internals. The Worker cron uses only public EmDash exports.
- **Leaving the plugin out of non-prod builds.** This guarantees no analytics code runs off prod, but it also makes the integration impossible to check locally. Demo mode makes no Cloudflare calls, and previews start from fresh seed data, never a copy of prod.
- **Alerting when the inbox notification fails.** The lead is safe in the CMS at that point, so an alert would be noise.
- **Shared Astro action glue for all three sites.** It would remove the duplicated error mapping, but this decision does not need it.

## Consequences

- Client sites ship less JavaScript, with no PostHog SDK and no analytics proxy in the Worker.
- No custom events. Client sites lose "contact form started" funnels. Lead counts and sources come from D1.
- The analytics plugin is young: version 0.3.x, one maintainer, MIT license. If it is abandoned we fork it. The Cloudflare data stays ours either way.
- The plugin's sync runs on the minute cron and needs Workers Paid, which the account already has.
- The prod deploy token gains `Account Settings Write` because creating a `Rum.Site` is expected to need it. The first prod deploy proves the permission.
- The failure alert is emailed only once the shared `studio.sender` is set after the sending subdomain exists. Until then it is logged. `ALERT_EMAIL` now binds the committed forwarding address `studio.alertInbox`, not a GitHub secret. Site stacks pass committed mail routes to `leadMail`; the GitHub stack only provisions the analytics token.
- jbolabs has no CMS. It gets the beacon and the alert, and its stats live in the Cloudflare dashboard.
