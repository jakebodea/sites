# Stack and decisions

The reference for how Jake builds marketing sites and products. Decided 2026-10-05 after reviewing T3 Code, Executor v2, pcobooster, shouldertap, and the earlier sites (Black Swan Realty, Access Electric, MS Homes). This file lists current choices. Why a one-way choice was made lives in [`docs/adr/`](adr/), one dated record per decision. To change a decision, edit this file in the same PR as the code, and add an ADR (from [`adr/template.md`](adr/template.md)) when the reasons matter later.

Guiding principle: be all-in on Cloudflare + Alchemy + Effect, add as few vendors as possible, and make every repo something an agent can change _and prove_ on its own.

## Repositories

| Repo | Holds |
| --- | --- |
| `sites` (this one, public) | Marketing sites and small side projects. `apps/<site>`, one Alchemy stack per site, Turborepo. |
| One repo per product | pcobooster, shouldertap, future products. Own CI, owners, upgrade pace. A product's own marketing site lives in the product repo. |
| `jakebodea/toolkit` (later) | Public `@jakebodea/*` packages: `config`, `cloudflare-kit`, `proof`, `control-app`, `agent-skills`. Extracted from this repo's `packages/` once the Access Electric reference build is reviewed. Consumed from npm, pinned, upgraded by Renovate. |

`.repos/` (gitignored) holds read-only source of pinned dependencies (Effect, Alchemy, EmDash) for agents to read. It is never a dependency mechanism.

## Marketing sites

- **Astro + EmDash CMS** on **Alchemy v2** (`Cloudflare.Website.Astro`): D1 (content), R2 (media), Images binding (resizing), auto-provisioned KV (sessions), production every-minute cron (EmDash scheduled publishing). Preview cron triggers are off unless `PREVIEW_SCHEDULED_PUBLISHING=1` is deliberately supplied for a scheduling test. Zero client JS by default.
- **shadcn/ui as React islands** only where interactive (mobile nav, gallery, contact form). Tailwind v4. Mobile-first, accessible, Core Web Vitals budgets.
- **Effect on the server only** (contact form, email). React islands stay plain React.
- **Content**: client-editable through EmDash. Draft production-content loading uses a purpose-limited published exporter and fresh branch-native setup; local `start/reset --content seed|prod` defaults to seed, restart retains selection, and `content refresh` replaces the isolated local copy with rollback. Fresh hosted PR stages opt in with both `preview` and `production-content`; completed hosted stages preserve edits. See [ADR 0003](adr/0003-published-production-content.md). **CMS login**: Jake is the permanent Admin, configured by `studio.cmsOwnerEmail`. CI reserves the owner account after seeding; first login uses an emailed EmDash sign-in link, then Jake can add a passkey. Clients receive **Editor** invitations only. Public first-admin setup is closed. See [ADR 0002](adr/0002-studio-owned-cms-admin.md).
- **Contact form**: Turnstile → store lead → email the client through Cloudflare Email Service. Sender and alert inbox come from `studio` in `stacks/config.ts`; the client inbox is `site.leadInbox`. jbolabs.com is registered (Cloudflare Registrar) and `stacks/studio.ts` manages its zone, registrar settings, `mail.jbolabs.com` sending subdomain, and Email Routing. Mail is logged instead of sent only when `studio.sender` is unset. Failure alerts are under [Analytics, logs, monitoring](#analytics-logs-monitoring).
- **Hosting**: all client sites in Jake's Cloudflare account; hand off later with Alchemy adopt/transfer if a client wants ownership.

### EmDash on Alchemy workarounds (verified live 2026-10-05)

Alchemy's Astro adapter pins its own Worker entry and image endpoint. Four Vite aliases in the site's `astro.config` fix it; keep them in one commented block so they're easy to delete when Alchemy supports a custom entry:

1. Alchemy's pinned entry (`@alchemy.run/frontend-frameworks/astro/entrypoints/server`) → `src/worker.ts` (keeps EmDash's `scheduled()` cron + `PluginBridge`).
2. `@astrojs/cloudflare/entrypoints/server` → Alchemy's vendored `.../entrypoints/server.js`.
3. Astro’s `assets/services/noop` → `@astrojs/cloudflare/image-service-workerd`: Alchemy forces the noop service, which removes the output format. Restore format and responsive width URLs so the endpoint transforms instead of streaming originals.
4. Alchemy's `image-passthrough-endpoint.js` → `@emdash-cms/cloudflare/image-endpoint` (+ bind `IMAGES: Cloudflare.Images.Images("IMAGES")`).

The CMS sites authorize only their configured hostname’s `/_emdash/api/media/file/**` path for image optimization (localhost in credential-free audits). Astro’s `site` does not populate EmDash’s image source allowlist, so this pattern is explicit. Local built-Worker verification on 2026-10-06 confirmed resized WebP output and rejection of unapproved external origins; deployed verification remains required.

Also:

- **No `adapter`** in the Astro config. CI builds without Cloudflare credentials via `ASTRO_STANDALONE_BUILD=1 astro build`, which adds Alchemy's adapter directly.
- **Default config filename** (`astro.config.ts`): Alchemy's `config:` prop double-joins paths.
- **Vite SSR pre-bundling** (`vite.ssr.optimizeDeps` in `astro.config.ts`): include EmDash's CommonJS deps (`sanitize-html`, `@lingui/core`) and the Effect stack, exclude `emdash` itself, and set `noDiscovery: true`. Without it, workerd's dev runner can't evaluate CJS, and late re-optimizations leave stale chunks or two React copies ("Invalid hook call").
- **Fresh stages boot empty**: EmDash applies the seed during first-run setup. CI seeds every deployed CMS stage, production included, through the setup API (`bun run app -- seed --url <stage>`), then provisions the configured studio owner through a credential-protected app endpoint. An existing completed site skips content seeding and verifies ownership. After launch content changes happen in the CMS, never from `seed.json`.
- **Core migrations run in the deploy, not on a request**: `scripts/ci/deploy.ts` runs `emdash migrate` against each CMS site's D1 right after `alchemy deploy` (EmDash's deployment-managed migrations). A request that runs them on a fresh database and is cut off leaves the migration lock held for good; that wedged the first prod deploys on 2026-10-06. Runtime mode stays `auto` until the deploy step has proven reliable, then moves to `check`.
- **R2 buckets** need `forceDestroy: true` on non-prod stages, or `destroy` fails.
- **The first request after a fresh deploy** can 503 while EmDash migrates; warm it up.
- **bun** needs `[install] peer = false`, or installing `@alchemy.run/frontend-frameworks` hangs.
- **Workers Paid is required.** On the Free plan's 10 ms CPU limit, EmDash's server rendering hits "Worker exceeded resource limits" (error 1102) under modest concurrency. The account was upgraded on 2026-10-05; afterwards ae-preview served 40 concurrent requests and a full smoke run with no failures.
- **Layering**: never import `@jakebodea/cloudflare-kit/infra` from runtime code; it pulls Alchemy's deploy-time modules into the Worker.

Local verification runs entirely under `alchemy dev`, which (as of `alchemy@2.0.0-beta.80`) emulates Workers, D1, R2, KV, Queues, Secrets Store, and Images locally; only Turnstile (test keys) and Email are cloud-only. Spike notes: `spikes/emdash-alchemy/README.md`.

- **Public CMS HTML cache**: production anonymous GETs to public page/portfolio/project route shapes use the existing Worker Cache API with a 30-second TTL. The TTL binding is declared in each Alchemy stack; set it to `"0"` to disable. Cookies, authorization, queries (including preview links), reload directives, CMS/admin/auth/action/media routes, contact, non-GET methods, non-HTML/error/negotiated responses, and any `Set-Cookie` or private/no-store response bypass it. Browsers receive `Cache-Control: no-store`; `X-Public-HTML-Cache` distinguishes MISS/HIT. Each Cloudflare data center fills its own copy, every request still invokes the Worker, and anonymous visitors may see the previous published revision for up to 30 seconds after a CMS edit. Native version metadata, bound through Alchemy, partitions the cache so code deploys start cold and cannot reuse HTML from an older asset build. There is no stale-while-revalidate and no global purge claim. Authenticated CMS/editing requests see current content immediately. Alchemy explicitly leaves the newer pre-Worker `cache` feature disabled, because [Workers Cache bills otherwise-free asset requests](https://developers.cloudflare.com/workers/cache/#pricing). No zone cache rules, new cloud storage, or dashboard settings are required. `node scripts/ci/public-html-fixture.ts` verifies the built Worker, local D1/KV/R2, real CMS draft/publish APIs, cache hits and expiry for both sites.

- **SEO**: SSR everywhere; EmDash sitemap/robots; non-prod stages send `X-Robots-Tag: noindex` from the worker; `@jakebodea/cloudflare-kit/seo` keeps titles and descriptions inside snippet budgets and builds BreadcrumbList JSON-LD. The `seo` skill maps the full checklist to automated rules and the manual launch steps (Search Console, copy review, E-E-A-T, backlinks).

## Products

- **TanStack Start / Router + Effect HttpApi** (public HTTP, OpenAPI) or **Effect RPC** (own clients). Not Hono, and never a mix of Hono/oRPC/zod/Effect in one request path.
- Contracts in a shared Effect Schema package; `@effect/atom-react` for client state.
- **Database**: D1 or Durable Object SQLite first; Postgres over Hyperdrive only when outgrown.
- **Auth**: Better Auth on D1 (`@alchemy.run/better-auth`).
- **Errors**: PostHog error tracking only.
- **Mobile**: Expo / React Native by default (shares TypeScript + Effect contracts; builds via `rnd` on GitHub Actions). Native Swift when the app is about deep system integration (shouldertap). pcobooster → Expo if it ever needs an app; shouldertap stays Swift.
- **Mac distribution**: R2 + Sparkle appcast, managed by Alchemy.

## Analytics, logs, monitoring

Why each client-site choice was made, and how it is built: [ADR 0001](adr/0001-client-site-analytics-and-alerting.md).

- **Client traffic**: Cloudflare Web Analytics, one prod-only `Cloudflare.Rum.Site` per site. Cookieless, no consent banner. Dev and preview collect nothing.
- **Client stats**: `@eisbachcode/emdash-plugin-analytics` in the EmDash admin. Its settings come from Worker bindings, never the settings form. Dev and preview show demo data. jbolabs has no CMS and uses the Cloudflare dashboard.
- **Client alerts**: a contact submission that may be lost is logged with the lead and emailed to the committed `studio.alertInbox` (`alerts@jbolabs.com`) on prod. Alerts name the site and include its origin. No PostHog or Axiom on client sites.
- **Logs and traces**: Cloudflare Workers Logs and traces on every stage, through `siteObservability`.
- **Products**: PostHog for funnels, replay, flags, experiments, and errors, through a custom Alchemy provider on `@distilled.cloud/posthog`. Axiom when a product needs log search and retention beyond Workers Logs.
- Disable Cloudflare Web Analytics edge auto-injection on product zones (`Cloudflare.Rum.Site`).

## Secrets

No Infisical, no 1Password.

- Local: one `.env` in the **main checkout** only. Worktrees get a symlink (`scripts/setup-worktree.ts` via `t3.json` `runOnWorktreeCreate` + lefthook `post-checkout`), and Alchemy's DotEnv provider reads the main checkout's file via `git rev-parse --path-format=absolute --git-common-dir` as a fallback.
- CI: every workflow variable and secret is written by Alchemy in `stacks/`. `scripts/ci/workflow-env.test.ts` rejects references without a stack writer. Email addresses are committed configuration, not secrets. `FORWARD_TO` is the real inbox that `stacks/studio.ts` registers as the Email Routing destination.
- Published export: private `PUBLISHED_CONTENT_EXPORT_TOKEN` (at least 32 random characters) shared through main-checkout `.env` and Alchemy-written production/preview GitHub environment secrets; production-only export and dev/pr-only bootstrap completion. One-time control-plane deployment plus normal CI production deployment is required.
- Generated secrets: `Alchemy.Random`. Shared rotatable secrets: Cloudflare Secrets Store.
- Cloudflare credentials: Alchemy profiles (`~/.alchemy`), never exported env vars.

## Environments and stages

- `dev-<worktree>`: per-worktree `alchemy dev` stage (parallel agents never collide).
- `pr-<n>`: per-PR preview for affected sites only, requested by adding the `preview` label. Subsequent pushes update it while the label remains; removing the label or closing the PR destroys it. Shared code changes affect every site; docs-only changes deploy none.
- `prod`: custom domain attached only here. JBO Labs uses `jbolabs.com`, with HTTP, `www`, and the old workers.dev hostname redirecting to HTTPS on the apex. Client domains remain unset until their zones are on the account and serve from workers.dev meanwhile. Deploys only from CI on `main`.
- State: `Cloudflare.state()`.
- Legacy named previews `access-electric/ae-preview` and `ms-custom-homes/preview` were retired through Alchemy on 2026-10-08. The daily PR janitor deliberately owns only `pr-<n>` stages; it never guesses whether an ad-hoc demo is still needed. `scripts/ci/retire-preview.alchemy.ts` is a teardown-only entrypoint restricted to these two exact site/stage pairs and uses their existing state without loading app build inputs or current CMS secrets.

## DevOps

- **GitHub Actions** with thin YAML; logic in tested TypeScript under `scripts/ci/`.
- **Turborepo** with `--affected` and a **remote cache hosted on Cloudflare** (Worker + R2, Alchemy stack `stacks/turbo-cache.ts`) shared by CI and every agent worktree.
- **Alchemy** deploys; memoized builds mean unchanged sites are no-ops. Don't double-build.
- **`stacks/github.ts`** (typed Alchemy GitHub provider): environments, the `preview` label, `main` ruleset, scoped expiring Cloudflare tokens per environment (rotate by bumping a generation), variables, `GitHub.Comment` for preview URLs. Redeploy this stack to provision the label. Workflows themselves stay YAML.
- Workflows: `ci.yml` (check → parallel preview deployments + hosted smoke and SEO audit → prod + post-deploy smoke and SEO audit), `preview-cleanup.yml` (refuses `prod`), `janitor.yml` (closed or unlabeled PR previews), `upgrade-smoke.yml` (weekly latest Alchemy/EmDash smoke). Hosted verification waits for the origin to answer HTTP 200 before running checks, with 30 attempts, a five-second request timeout, and five seconds between attempts to allow new domain DNS and TLS activation. Actions pinned to SHAs, least-privilege permissions, `actionlint`, `dependency-review`, fork PRs never get credentials. **Renovate** for upgrades.
- CI restores Bun downloads through GitHub Actions; Turbo task results come from the remote cache only (a GitHub Actions cache is scoped per PR, so main could never reuse a PR's builds). Turbo tasks order on `sync` only: typecheck produces no outputs, so builds and tests start without waiting for upstream typechecks. Hosted preview verification overlaps up to three independent sites and each site’s smoke/SEO checks. Reports are isolated per site.
- The required `check` job gathers `lint-test` (lint, typecheck, tests) and one `verify` runner per affected site, all in parallel after `affected`. Each `verify` runner runs smoke, rendered SEO, and Lighthouse for its site before deployment, using Alchemy's standalone build in disposable Miniflare Workers with local D1/R2/KV/Images. It seeds CMS content and serves seed images from the build assets, so no cloud preview or deploy credentials are needed. `.build-inputs.json` participates in the build cache key. Local SEO checks content; deployed SEO additionally checks stage indexing policy and response timing. Lighthouse uses the same unchanged budgets on `/` and `/contact`, auditing each URL twice and asserting on the better run (a URL's first run often lands on a cold Chrome or a cold Worker: on 2026-10-06 every blocking-time spike, up to 441 ms, hit the first-audited `/` and none the second-audited `/contact`), with one Node/Miniflare lifecycle and browser audit per runner. `@lhci/cli` is a pinned dev dependency so its tree is in the lockfile. Native Worker startup has a 30 s deadline; CMS setup retains its separate 180 s migration deadline. These required checks run for unlabeled and fork PRs with no deploy credentials. The `preview` label controls only the persistent hosted review environment and its additional hosted smoke and SEO checks. Preview site stacks deploy concurrently (up to three) after one account-wide Alchemy state-store bootstrap; production and teardown stay serialized. Lighthouse runs only in required per-site verification, so a preview does not repeat the same browser audits. Failed smoke/SEO/Lighthouse reports remain available in logs and uploaded artifacts.
- **Backups**: D1 Time Travel + scheduled EmDash export to a retained R2 bucket.

## Tooling

- **Bun** (`[install] peer = false`), workspaces + catalogs, exact pins (never `latest`).
- **Ultracite strict**: presets `core`, `react`, `astro`, `shadcn` (`@shadcn/lint`), `anti-slop`, `vitest`; JS plugins `react-doctor`, `sonarjs`; type-aware; a local plugin (no `transition-colors`, prefer shared controls, no em dashes in user-facing copy). `--max-warnings 0` everywhere; disabling a rule needs a written reason.
- **lefthook**: pre-commit `ultracite fix` on staged files; pre-push typecheck; post-checkout worktree setup.
- **Tests**: `@effect/vitest` with test Layers; Playwright e2e for products; workerd smoke + Lighthouse for marketing sites.
- **`@effect/tsgo`** for Effect diagnostics; `knip` optional.

## Agent self-verification (pstack / poteto-mode)

An agent's work isn't done until it's proven on the real running surface.

- **`bun run app -- …` (control-app CLI + skill)**: `start` (local workerd, seeded, per-worktree port), `reset`, `login` (local test admin via Playwright virtual WebAuthn authenticator), `open/click/fill/snapshot`, `screenshot` (1280 + 375), `record`, `smoke`, `seo` (crawls every page's server-rendered HTML: titles, descriptions, canonicals, one H1, alt text, breadcrumbs, noindex, sitemap/orphans, redirects, 404s, image formats), `logs`; JSON output and artifacts under `.artifacts/`; `--url` targets a deployed stage.
- **`bun run proof -- doctor|run|verify|publish`**: revision-bound proof receipts with path-derived risk tiers (ported from pcobooster). Visible changes need screenshots/video.
- **Agent Alchemy profile**: scoped API token that can deploy/destroy `dev-*` and `pr-*`, refused for `prod`; no interactive logins ever needed.
- AGENTS.md "Definition of done": check/typecheck/test → verify on the running surface → proof receipt → report what remains unverified.

## Agent docs

T3 Code / Executor style: root `AGENTS.md` (+ `CLAUDE.md` symlink) with stack map, commands, never-break rules, definition of done; `CONTEXT.md` domain glossary; `docs/stack.md` current choices; `docs/adr/` decision records; skills in `.agents/skills/` (`new-site`, `deploy`, `add-section`, `control-app`, `ultracite`, `shadcn`).

## Open items

- Reassess the newer pre-Worker Workers Cache only after measuring asset/request billing and defining global publish invalidation; production CMS pages currently use the bounded internal Cache API described above.
- Get a scoped `agent` Alchemy profile; re-auth the `default` OAuth profile from a real terminal.
- Apply the CI control-plane changes with explicit authorization to provision the analytics-read token. Verify that Account Settings Write permits Rum site creation on the first prod deploy. Real domains and verified senders are still needed for email.
- File Alchemy issues: supported custom Worker entry for `Website.Astro`; `config:` path bug; EmDash image endpoint support; SSR dep-optimizer instability under the workerd dev runner (stale chunks / duplicate React); dev proxy resetting curl connections.
- Extract `@jakebodea/*` toolkit; adopt in pcobooster (drop Infisical, add control-app, fake Planning Center, per-worktree stages) and shouldertap.
