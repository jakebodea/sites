---
name: new-site
description: Create a new client marketing site in this monorepo from the reference site, through first deploy and client CMS access. Use when the user wants to start a new site.
---

# New site

Ask the user for: business name, domain (or none yet), brand colors/logo, and the pages they need. Confirm before every deploy.

1. **Copy** `apps/access-electric` to `apps/<site>` (kebab-case). Delete its `seed/media`, `.alchemy`, `.artifacts`, `dist`, `emdash-env.d.ts`. Set `"name": "@sites/<site>"` in its `package.json`.
2. **Identity**: edit `site.config.ts` (id, name, domain, business facts; leave unknowns undefined). Set `domain: null` until the zone is on the Cloudflare account: prod then serves from `<site>-prod.jakebodea.workers.dev` and `public/` (logo, favicons, OG image). Brand colors live in `src/styles/global.css`.
3. **Content model**: edit `seed/seed.json` (collections, block types, menus, starting content). Images go in `seed/media/` and are referenced as `/_seed/media/<file>`. Run `bun --cwd apps/<site> run types` and `bun run ci` (the seed test checks references).
4. **Verify locally**: `ALCHEMY_PROFILE=admin bun run app -- reset --site <site>`, then `smoke`, `seo` (zero errors), and `screenshot` every page at both widths. Fix what you see.
5. **Preview deploy** (ask first): open a PR; CI deploys `pr-<n>` and comments the URL. Or `cd apps/<site> && ALCHEMY_PROFILE=admin bun alchemy deploy --stage <name>-preview`.
6. **Production** happens on merge to `main` (CI). CI seeds the site and reserves Jake's Admin account using `studio.cmsOwnerEmail`; public first-admin setup is disabled. Jake opens `https://<domain>/_emdash/admin` and requests an email sign-in link, then adds a passkey on their own device if desired. Passkeys are bound to the hostname, so add the permanent passkey after the custom domain is attached. Verify the owner-ready result before handing the site to a client. Then work the launch checklist in the `seo` skill.
7. **Client access**: Jake uses Users → Invite → role **Editor**. The shared policy rejects other invite roles and prevents client promotion to Admin. Until email is configured, copy the client invite link and send it yourself. Owner first login requires working CMS email.
8. **Analytics and alerts**: keep the reference site's `webAnalytics`, `leadMail`, `emdashSecrets`, `KitEmDashEnv`, `<WebAnalyticsBeacon />`, `analyticsPlugin`, and `siteScheduled` wiring. Prod creates its own Rum site; the minute cron reconciles encrypted plugin settings from bindings. Dev and preview use demo data and render no beacon. The production analytics-read token and private `ALERT_EMAIL` come from `stacks/github.ts`; no settings are pasted into the CMS. A verified `EMAIL_FROM` enables lead mail and alerts. See [ADR 0001](../../../docs/adr/0001-client-site-analytics-and-alerting.md). PostHog is reserved for products.
9. **Verify the plugin**: after reset, sign in with `bun run app -- login --site <site>`, run smoke to exercise the minute cron, and inspect the admin Analytics page with authenticated snapshots and screenshots at both widths. Confirm demo data and no beacon on public pages.
