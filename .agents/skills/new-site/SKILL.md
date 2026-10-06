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
6. **Production** happens on merge to `main` (CI). Immediately after the first prod deploy, the user opens `https://<domain>/_emdash/admin` (the prod workers.dev address while there is no domain) and completes setup. Passkeys are bound to the hostname, so prefer finishing setup once the custom domain is attached with their own passkey: whoever finishes setup first becomes admin. Then work the launch checklist in the `seo` skill (Search Console, old-site redirects, copy review).
7. **Client access**: in the CMS, Users → Invite → role **Editor**. Until email is configured, copy the invite link and send it yourself.
8. **Optional per site**: PostHog project key and verified email sender (`EMAIL_FROM`).
