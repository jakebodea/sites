---
name: seo
description: Technical and on-page SEO for a marketing site: run the automated audit, fix its findings, and work the manual launch checklist (Search Console, copy, author/E-E-A-T, backlinks). Use when building or changing pages, before a production launch, or when asked about SEO, search ranking, sitemaps, meta tags, structured data, or page speed.
---

# SEO

Most of the checklist is automated. `bun run app -- seo` crawls every sitemap page plus every internal link on a running stage and reads the server-rendered HTML the way a crawler does. Errors exit 1. CI runs it on every preview and on production (`scripts/ci/verify-previews.ts`).

```bash
bun run app -- seo                    # local dev stage
bun run app -- seo --url https://…    # any deployed stage; production rules apply to the custom domain and <site>-prod.*.workers.dev
```

Errors must be zero. Warnings are judgment calls: fix them in code, or leave them to editors when they're about content (a long project name: the editor sets an SEO title in the entry's SEO panel).

## The checklist

| # | Item | How this repo handles it | Check |
| --- | --- | --- | --- |
| 1 | Server-side rendering | Astro renders every page on the Worker; islands only add interactivity. Content must never depend on client JS. | the audit reads raw HTML: missing content fails `title`/`one-h1` |
| 2 | XML sitemap | EmDash serves `/sitemap.xml` from every collection with a `urlPattern`. A page type that isn't a collection isn't in it (that's why the home page is a `home` collection). | `sitemap`, `sitemap-complete` |
| 3 | Submit to Search Console | Manual, once per site after the first prod deploy (below). | — |
| 4 | robots.txt not blocking | EmDash allows `/` and blocks only `/_emdash/`. Editors can override it in Settings → SEO; the audit catches a blanket `Disallow: /`. | `robots-txt` |
| 5 | No stray noindex | Non-prod stages send `X-Robots-Tag: noindex` from `src/worker.ts` (a header, not robots.txt, so crawlers see it). Production never does. Per-entry noindex is the CMS SEO panel. | `indexable`, `preview-noindex` |
| 6 | No redirect chains | Link to final URLs. When replacing an old site, map every old URL to its new one in a single 301. | `no-redirect-chains`, `no-internal-redirects` |
| 7 | No 404s | Internal links are crawled; the 404 page answers 404 with noindex. | `no-broken-links`; `smoke` checks the 404 status |
| 8 | Canonical on every page | `src/layouts/base.astro` emits an absolute canonical; `getSeoMeta()` honors an editor override. | `canonical` |
| 9 | Meta description on every page | Base layout runs every description through `metaDescription()` (`@jakebodea/cloudflare-kit/seo`): too long → whole sentences; too short → appends `site.descriptionContext`. Collection pages generate a specific one rather than falling back to the tagline. | `meta-description`, `unique-description` |
| 10 | One H1 | The hero block or `PageHeader` owns the H1; every other block starts at H2. | `one-h1` |
| 11 | FAQ schema | Not built yet. Google only shows FAQ rich results for authoritative government/health sites, but `FAQPage` JSON-LD still feeds AI answer engines. When a site has an FAQ, add it as a block (see `add-section`) that renders the visible Q&A and the JSON-LD from the same items, like `breadcrumbs.astro`. | `structured-data` (valid JSON) |
| 12 | Breadcrumbs | `src/components/breadcrumbs.astro` renders the visible trail and `BreadcrumbList` JSON-LD from one list. Use it on every page two or more levels deep. | `breadcrumbs` |
| 13 | No orphan pages | Every sitemap page must be linked from some page (nav, a category, related projects). | `no-orphans` |
| 14 | Alt text | CMS media carry an alt field; decorative images (hero backgrounds) use `alt=""` inside `aria-hidden`. The audit only checks the attribute exists: read the alts. | `image-alt` |
| 15 | WebP/AVIF | CMS images go through `/_image` (Cloudflare Images negotiates AVIF/WebP). Static files in `public/` must be WebP or SVG, sized at 2x their display size (`cwebp -q 90 -resize W H`). Keep a PNG only where a consumer needs it (JSON-LD logo, OG image). | `modern-images` |
| 16 | No layout shift | Every `<img>` has `width`/`height`; EmDash `<Image>` adds them. Lighthouse CLS runs on previews. | `no-layout-shift`, Lighthouse |
| 17 | Under 2 s | Workers Paid (the Free plan's 10 ms CPU limit fails SSR), server-rendered HTML, no client JS beyond islands. | `fast-response` (800 ms TTFB), Lighthouse perf ≥ 0.9 on `/` and `/contact` |
| 18 | No AI-slop copy | Manual (below). Ultracite's anti-slop plugin covers code, not copy. | — |
| 19 | Author/expertise | Manual (below). | — |
| 20 | Backlinks | Off-site, manual (below). | — |

Also enforced: titles ≤ 60 characters (`documentTitle()` drops the site suffix when it doesn't fit), unique titles, and valid JSON-LD (`Electrician`/`LocalBusiness` on every page from `site.config.ts`).

## Manual launch checklist

Do these once per site, right after the first production deploy. Ask the user before touching DNS or any account.

1. **Search Console**: add a _Domain_ property for the apex domain. The domain is on Cloudflare, so verify with the TXT record. Submit `https://<domain>/sitemap.xml`. Then import the property into Bing Webmaster Tools (it also feeds ChatGPT search and Copilot).
2. **Run** `bun run app -- seo --url https://<domain>`: zero errors, and production rules apply.
3. **Old site**: if the client had one, crawl its URLs and 301 each one to its new equivalent in a single hop. Check a handful in Search Console's URL inspection a week later.

## Copy review (before launch and whenever copy changes)

The site should read like the client wrote it. Cut:

- Filler adjectives: "seamless", "cutting-edge", "innovative solutions", "elevate", "unlock", "world-class", "in today's fast-paced world".
- Claims with no evidence. Replace them with specifics: years in business, project counts, named clients, square footage, licenses, certifications.
- The same sentence shape repeated, and em-dash or triad tics.
- Anything the client can't vouch for. Leave a fact out rather than guess (same rule as `site.config.ts`).

## Author and expertise (E-E-A-T)

- An About or Team page with real people, roles, years of experience, and credentials (for contractors: license numbers such as CSLB; certifications such as WBE).
- `site.config.ts` business facts feed the `Electrician`/`LocalBusiness` JSON-LD. Add `sameAs` links (Google Business Profile, LinkedIn, certification directory listings) once they exist.
- If a site adds a blog, use EmDash bylines so each post has a named author with a bio.

## Backlinks (off-site; advise the user, don't do it)

- Google Business Profile, with the same name, address and phone as the site.
- Industry and certification directories: trade associations, the WBE/MBE certification listings, supplier and manufacturer partner pages.
- General contractors and clients who credit their subcontractors, and case studies on partners' sites.
- Local press and community sponsorships.

## When you change a page

Run `bun run app -- seo` before calling it done. New page types need: a collection with a `urlPattern` (sitemap), breadcrumbs if they're two or more levels deep, a generated meta description, and an H1 from the page's header.
