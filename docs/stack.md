# Stack and decisions

The reference for how Jake builds marketing sites and products. Decided 2026-10-05 after reviewing T3 Code, Executor v2, pcobooster, shouldertap, and the earlier sites (Black Swan Realty, Access Electric, MS Homes). Change a decision by editing this file in the same PR as the code.

Guiding principle: be all-in on Cloudflare + Alchemy + Effect, add as few vendors as possible, and make every repo something an agent can change _and prove_ on its own.

## Repositories

| Repo | Holds |
| --- | --- |
| `sites` (this one, public) | Marketing sites and small side projects. `apps/<site>`, one Alchemy stack per site, Turborepo. |
| One repo per product | pcobooster, shouldertap, future products. Own CI, owners, upgrade pace. A product's own marketing site lives in the product repo. |
| `jakebodea/toolkit` (later) | Public `@jakebodea/*` packages: `config`, `cloudflare-kit`, `proof`, `control-app`, `agent-skills`. Extracted from this repo's `packages/` once the Access Electric reference build is reviewed. Consumed from npm, pinned, upgraded by Renovate. |

`.repos/` (gitignored) holds read-only source of pinned dependencies (Effect, Alchemy, EmDash) for agents to read. It is never a dependency mechanism.

## Marketing sites

- **Astro + EmDash CMS** on **Alchemy v2** (`Cloudflare.Website.Astro`): D1 (content), R2 (media), Images binding (resizing), auto-provisioned KV (sessions), every-minute cron (EmDash scheduled publishing). Zero client JS by default.
- **shadcn/ui as React islands** only where interactive (mobile nav, gallery, contact form). Tailwind v4. Mobile-first, accessible, Core Web Vitals budgets.
- **Effect on the server only** (contact form, email). React islands stay plain React.
- **Content**: client-editable through EmDash. **CMS login**: EmDash invites + passkeys; invite the client as **Editor**; finish EmDash setup immediately after the first prod deploy (whoever completes setup first becomes Admin).
- **Contact form**: Turnstile → store lead → Cloudflare Email notification. Verification outages, save failures, and defects log recoverable lead details with a request ID and email `ALERT_EMAIL`. Visitor rejection never alerts; inbox delivery failure logs and the visitor still succeeds.
- **Hosting**: all client sites in Jake's Cloudflare account; hand off later with Alchemy adopt/transfer if a client wants ownership.

### EmDash on Alchemy workarounds (verified live 2026-10-05)

Alchemy's Astro adapter pins its own Worker entry and image endpoint. Three Vite aliases in the site's `astro.config` fix it; keep them in one commented block so they're easy to delete when Alchemy supports a custom entry:

1. Alchemy's pinned entry (`@alchemy.run/frontend-frameworks/astro/entrypoints/server`) → `src/worker.ts` (keeps EmDash's `scheduled()` cron + `PluginBridge`).
2. `@astrojs/cloudflare/entrypoints/server` → Alchemy's vendored `.../entrypoints/server.js`.
3. Alchemy's `image-passthrough-endpoint.js` → `@emdash-cms/cloudflare/image-endpoint` (+ bind `IMAGES: Cloudflare.Images.Images("IMAGES")`).

Also:

- **No `adapter`** in the Astro config. CI builds without Cloudflare credentials via `ASTRO_STANDALONE_BUILD=1 astro build`, which adds Alchemy's adapter directly.
- **Default config filename** (`astro.config.ts`): Alchemy's `config:` prop double-joins paths.
- **Vite SSR pre-bundling** (`vite.ssr.optimizeDeps` in `astro.config.ts`): include EmDash's CommonJS deps (`sanitize-html`, `@lingui/core`) and the Effect stack, exclude `emdash` itself, and set `noDiscovery: true`. Without it, workerd's dev runner can't evaluate CJS, and late re-optimizations leave stale chunks or two React copies ("Invalid hook call").
- **Fresh stages boot empty**: EmDash applies the seed during first-run setup. Previews are seeded with `bun run app -- seed --url <stage>` (setup API, admin account left unclaimed); production waits for a human to finish setup.
- **R2 buckets** need `forceDestroy: true` on non-prod stages, or `destroy` fails.
- **The first request after a fresh deploy** can 503 while EmDash migrates; warm it up.
- **bun** needs `[install] peer = false`, or installing `@alchemy.run/frontend-frameworks` hangs.
- **Workers Paid is required.** On the Free plan's 10 ms CPU limit, EmDash's server rendering hits "Worker exceeded resource limits" (error 1102) under modest concurrency. The account was upgraded on 2026-10-05; afterwards ae-preview served 40 concurrent requests and a full smoke run with no failures.
- **Layering**: never import `@jakebodea/cloudflare-kit/infra` from runtime code; it pulls Alchemy's deploy-time modules into the Worker.

Local verification runs entirely under `alchemy dev`, which (as of `alchemy@2.0.0-beta.80`) emulates Workers, D1, R2, KV, Queues, Secrets Store, and Images locally; only Turnstile (test keys) and Email are cloud-only. Spike notes: `spikes/emdash-alchemy/README.md`.

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

- **Client traffic**: Cloudflare Web Analytics, one prod-only `Cloudflare.Rum.Site` per site, managed by Alchemy. The shared beacon only renders on the production origin hostname or its `www` form. Dev and preview collect no traffic. Cookieless, no consent banner.
- **Client stats**: `@eisbachcode/emdash-plugin-analytics@0.3.1` in EmDash. Its settings come from Worker bindings on the minute cron, before EmDash runs scheduled tasks. Only changed rows are written; tokens are encrypted and compared by plaintext and key fingerprint. Fresh databases retry on the next tick. Non-prod uses demo data and deletes Cloudflare settings. jbolabs has no CMS and uses the Cloudflare dashboard.
- **Analytics credentials**: `stacks/github.ts` creates an account-owned token with only Account Analytics Read and writes `CF_ANALYTICS_API_TOKEN` into the production GitHub environment. Each CMS stage generates a canonical base64url `EMDASH_ENCRYPTION_KEY` with `Alchemy.Random`. A missing prod API token warns and leaves the plugin's setup check visible.
- **Client alerts**: the shared contact pipeline logs `lead submit failed` with lead details and `requestId`, then emails the private `ALERT_EMAIL` when a verified sender exists. Until then, Workers Logs are the recovery path. No PostHog or Axiom on client sites. See [ADR 0001](adr/0001-client-site-analytics-and-alerting.md).
- **Logs/traces**: Cloudflare native Workers Logs and traces always on through `siteObservability`.
- **Products**: PostHog remains the default for funnels, replay, flags, experiments, and errors. Manage it through a custom Alchemy provider on `@distilled.cloud/posthog` when the first product needs it. The removed client-site browser/server/proxy code remains in git history. Use Axiom when a product needs log search and retention beyond Workers Logs.
- Disable Cloudflare Web Analytics edge auto-injection on product zones (`Cloudflare.Rum.Site`).

## Secrets

No Infisical, no 1Password.

- Local: one `.env` in the **main checkout** only. Worktrees get a symlink (`scripts/setup-worktree.ts` via `t3.json` `runOnWorktreeCreate` + lefthook `post-checkout`), and Alchemy's DotEnv provider reads the main checkout's file via `git rev-parse --path-format=absolute --git-common-dir` as a fallback.
- CI: GitHub environment secrets (`preview`, `production`), written by `stacks/github.ts`.
- Generated secrets: `Alchemy.Random`. Shared rotatable secrets: Cloudflare Secrets Store.
- Cloudflare credentials: Alchemy profiles (`~/.alchemy`), never exported env vars.

## Environments and stages

- `dev-<worktree>`: per-worktree `alchemy dev` stage (parallel agents never collide).
- `pr-<n>`: per-PR preview, destroyed on close.
- `prod`: custom domain attached only here (left unset until the zone is on the account, so prod serves from workers.dev); deploys only from CI on `main`.
- State: `Cloudflare.state()`.

## DevOps

- **GitHub Actions** with thin YAML; logic in tested TypeScript under `scripts/ci/`.
- **Turborepo** with `--affected` and a **remote cache hosted on Cloudflare** (Worker + R2, Alchemy stack `stacks/turbo-cache.ts`) shared by CI and every agent worktree.
- **Alchemy** deploys; memoized builds mean unchanged sites are no-ops. Don't double-build.
- **`stacks/github.ts`** (typed Alchemy GitHub provider): environments, `main` ruleset, scoped expiring Cloudflare tokens per environment (rotate by bumping a generation), variables, `GitHub.Comment` for preview URLs. Workflows themselves stay YAML.
- Workflows: `ci.yml` (check → preview + smoke + SEO audit + Lighthouse budgets → prod + post-deploy smoke and SEO audit), `preview-cleanup.yml` (refuses `prod`), `janitor.yml` (orphaned previews), `upgrade-smoke.yml` (weekly latest Alchemy/EmDash smoke). Actions pinned to SHAs, least-privilege permissions, `actionlint`, `dependency-review`, fork PRs never get credentials. **Renovate** for upgrades.
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

T3 Code / Executor style: root `AGENTS.md` (+ `CLAUDE.md` symlink) with stack map, commands, never-break rules, definition of done; `CONTEXT.md` domain glossary; skills in `.agents/skills/` (`new-site`, `deploy`, `add-section`, `control-app`, `ultracite`, `shadcn`).

## Open items

- Consider Workers Cache in front of each site's Worker (Alchemy `cache` prop + `Cache-Control`) to cut CPU per visit.
- Get a scoped `agent` Alchemy profile; re-auth the `default` OAuth profile from a real terminal.
- Apply the CI control-plane changes with explicit authorization to provision the analytics-read token and production alert secret. Verify that Account Settings Write permits Rum site creation on the first prod deploy. Real domains and verified senders are still needed for email.
- File Alchemy issues: supported custom Worker entry for `Website.Astro`; `config:` path bug; EmDash image endpoint support; SSR dep-optimizer instability under the workerd dev runner (stale chunks / duplicate React); dev proxy resetting curl connections.
- Extract `@jakebodea/*` toolkit; adopt in pcobooster (drop Infisical, add control-app, fake Planning Center, per-worktree stages) and shouldertap.
