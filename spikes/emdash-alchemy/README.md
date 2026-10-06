# EmDash Marketing Template (Cloudflare)

A conversion-focused landing page template built with [EmDash](https://github.com/emdash-cms/emdash) and deployed on Cloudflare Workers with D1 and R2. Modular content blocks let you assemble pages from reusable sections without touching code.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/emdash-cms/templates/tree/main/marketing-cloudflare)

![Marketing template homepage](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/marketing/latest/homepage-light-desktop.jpg)

## What's Included

- Hero section with CTAs
- Feature grid
- Testimonials
- Pricing cards
- FAQ accordion
- Contact page with direct email links
- SEO metadata and JSON-LD
- Dark/light mode

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| Pricing | `/pricing` |
| Contact | `/contact` |
| 404 | fallback |

## Screenshots

| | Desktop | Mobile |
|---|---|---|
| Light | ![homepage light desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/marketing/latest/homepage-light-desktop.jpg) | ![homepage light mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/marketing/latest/homepage-light-mobile.jpg) |
| Dark | ![homepage dark desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/marketing/latest/homepage-dark-desktop.jpg) | ![homepage dark mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/marketing/latest/homepage-dark-mobile.jpg) |

## Infrastructure

- **Runtime:** Cloudflare Workers
- **Database:** D1
- **Storage:** R2
- **Framework:** Astro with `@astrojs/cloudflare`

## Local Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard. EmDash runs database migrations and applies the marketing seed during setup. The site is available at http://localhost:4321.

## Deploying

```bash
pnpm wrangler login
pnpm deploy
```

The first deployment provisions the named D1 database and R2 bucket from `wrangler.jsonc`. See [Deploy to Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/) for production setup, or use the deploy button above.

## See Also

- [Node.js variant](../marketing) -- same template using SQLite and local file storage
- [All templates](../)
- [EmDash documentation](https://docs.emdashcms.com/)

## Alchemy spike (2026-10-05)

Deployed to a throwaway `spike` stage with `--profile admin`, tested live, then destroyed.

- `astro.config.mjs`: Alchemy-deployed config. No `adapter` (Alchemy injects its own). Three Vite aliases:
  1. Alchemy's pinned Worker entry -> `src/worker.ts` (keeps EmDash's `scheduled()` cron + `PluginBridge`).
  2. `@astrojs/cloudflare/entrypoints/server` -> Alchemy's vendored copy.
  3. Alchemy's passthrough `/_image` endpoint -> `@emdash-cms/cloudflare/image-endpoint` (R2 media + Images binding).
- `astro.config.wrangler.mjs` + `wrangler.jsonc`: the stock template, for comparison.
- `alchemy.run.ts`: D1 + R2 + Images binding + every-minute cron. Session KV is auto-provisioned.
- `scripts/smoke.sh <dist> <port>`: run a built bundle in local workerd and check pages, admin, cron.

Verified live: public pages, admin setup + passkey login, page edit (draft), scheduled publish via cron,
media upload to R2, resized WebP via `/_image`. Gotchas: Alchemy's `config:` prop double-joins the
path (use the default `astro.config.mjs`); bun needs `[install] peer = false`; R2 buckets need
`forceDestroy: true` on disposable stages or `destroy` fails with BucketNotEmpty.
