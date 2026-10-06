# Stack and decisions

The reference for how Jake builds marketing sites and products. Decided 2026-10-05 after reviewing T3 Code, Executor v2, pcobooster, shouldertap, and the earlier sites (Black Swan Realty, Access Electric, MS Homes). Change a decision by editing this file in the same PR as the code.

Guiding principle: be all-in on Cloudflare + Alchemy + Effect, add as few vendors as possible, and make every repo something an agent can change _and prove_ on its own.

## Repositories

| Repo | Holds |
| --- | --- |
| `sites` (this one, private) | Marketing sites and small side projects. `apps/<site>`, one Alchemy stack per site, Turborepo. |
| One repo per product | pcobooster, shouldertap, future products. Own CI, owners, upgrade pace. A product's own marketing site lives in the product repo. |
| `jakebodea/toolkit` (later) | Public `@jakebodea/*` packages: `config`, `cloudflare-kit`, `proof`, `control-app`, `agent-skills`. Extracted from this repo's `packages/` once the Access Electric reference build is reviewed. Consumed from npm, pinned, upgraded by Renovate. |

`.repos/` (gitignored) holds read-only source of pinned dependencies (Effect, Alchemy, EmDash) for agents to read. It is never a dependency mechanism.

## Marketing sites

- **Astro + EmDash CMS** on **Alchemy v2** (`Cloudflare.Website.Astro`): D1 (content), R2 (media), Images binding (resizing), auto-provisioned KV (sessions), every-minute cron (EmDash scheduled publishing). Zero client JS by default.
- **shadcn/ui as React islands** only where interactive (mobile nav, gallery, contact form). Tailwind v4. Mobile-first, accessible, Core Web Vitals budgets.
- **Effect on the server only** (contact form, analytics, email). React islands stay plain React.
- **Content**: client-editable through EmDash. **CMS login**: EmDash invites + passkeys; invite the client as **Editor**; finish EmDash setup immediately after the first prod deploy (whoever completes setup first becomes Admin).
- **Contact form**: Turnstile → store lead → Cloudflare Email notification → server-side PostHog `lead submitted`.
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
- **Fresh stages boot empty**: EmDash applies the seed during first-run setup. Previews are seeded with `bun run app -- seed --url <stage>` (setup API, admin account left unclaimed); production waits for a human to finish setup.
- **R2 buckets** need `forceDestroy: true` on non-prod stages, or `destroy` fails.
- **The first request after a fresh deploy** can 503 while EmDash migrates; warm it up.
- **bun** needs `[install] peer = false`, or installing `@alchemy.run/frontend-frameworks` hangs.
- **Workers Paid is required.** On the Free plan's 10 ms CPU limit, EmDash's server rendering hits "Worker exceeded resource limits" (error 1102) under modest concurrency. The account was upgraded on 2026-10-05; afterwards ae-preview served 40 concurrent requests and a full smoke run with no failures.
- **Layering**: never import `@jakebodea/cloudflare-kit/infra` from runtime code; it pulls Alchemy's deploy-time modules into the Worker.

Local verification runs entirely under `alchemy dev`, which (as of `alchemy@2.0.0-beta.80`) emulates Workers, D1, R2, KV, Queues, Secrets Store, and Images locally; only Turnstile (test keys), Email, and Axiom are cloud-only. Spike notes: `spikes/emdash-alchemy/README.md`.

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

- **PostHog** for product/web analytics and errors. Browser: posthog-js with an event allowlist and URL scrubbing, sent through a same-Worker proxy at a randomized path (`Alchemy.Random`), **cookieless (`persistence: "memory"`) on client sites, no consent banner**, collect only on the prod stage + hostname. Server: Effect `Analytics` service over posthog-node (`flushAt: 1`, `captureImmediate` in `waitUntil`). PostHog project/dashboards as code via a custom Alchemy provider on `@distilled.cloud/posthog` (Executor v2 pattern).
- **Logs/traces**: Cloudflare native Workers Logs + tracing (`Cloudflare.Telemetry()`) always on.
- **Monitoring**: **Axiom** via Alchemy's native provider (prod datasets, monitors on server errors and `lead submit failed`, email notifier) + a scheduled smoke workflow over every prod site.
- Disable Cloudflare Web Analytics edge auto-injection on product zones (`Cloudflare.Rum.Site`).

## Secrets

No Infisical, no 1Password.

- Local: one `.env` in the **main checkout** only. Worktrees get a symlink (`scripts/setup-worktree.ts` via `t3.json` `runOnWorktreeCreate` + lefthook `post-checkout`), and Alchemy's DotEnv provider reads the main checkout's file via `git rev-parse --path-format=absolute --git-common-dir` as a fallback.
- CI: GitHub environment secrets (`preview`, `production`), written by `stacks/github.ts`.
- Generated secrets: `Alchemy.Random`. Shared rotatable secrets: Cloudflare Secrets Store.
- Cloudflare credentials: Alchemy profiles (`~/.alchemy`), never exported env vars.

## Environments and stages

- `dev-<worktree>`: per-worktree `alchemy dev` stage (parallel agents never collide).
- `pr-<n>`: per-PR preview for affected sites only, requested by adding the `preview` label. Subsequent pushes update it while the label remains; removing the label or closing the PR destroys it. Shared code changes affect every site; docs-only changes deploy none.
- `prod`: custom domain attached only here (left unset until the zone is on the account, so prod serves from workers.dev); deploys only from CI on `main`.
- State: `Cloudflare.state()`.

## DevOps

- **GitHub Actions** with thin YAML; logic in tested TypeScript under `scripts/ci/`.
- **Turborepo** with `--affected` and a **remote cache hosted on Cloudflare** (Worker + R2, Alchemy stack `stacks/turbo-cache.ts`) shared by CI and every agent worktree.
- **Alchemy** deploys; memoized builds mean unchanged sites are no-ops. Don't double-build.
- **`stacks/github.ts`** (typed Alchemy GitHub provider): environments, the `preview` label, `main` ruleset, scoped expiring Cloudflare tokens per environment (rotate by bumping a generation), variables, `GitHub.Comment` for preview URLs. Redeploy this stack to provision the label. Workflows themselves stay YAML.
- Workflows: `ci.yml` (check → preview + smoke + SEO audit + Lighthouse budgets → prod + post-deploy smoke and SEO audit), `preview-cleanup.yml` (refuses `prod`), `janitor.yml` (closed or unlabeled PR previews), `upgrade-smoke.yml` (weekly latest Alchemy/EmDash smoke). Actions pinned to SHAs, least-privilege permissions, `actionlint`, `dependency-review`, fork PRs never get credentials. **Renovate** for upgrades.
- CI restores Bun downloads and a local Turbo task cache through GitHub Actions, including when remote cache credentials are absent. Successful tasks are saved before SEO validation, so audit failures do not discard reusable builds. Preview verification overlaps up to three independent sites and each site’s smoke/SEO checks, but serializes Lighthouse to avoid CPU contention affecting budgets. Lighthouse results and intermediate files are isolated per site; failed basic checks skip its browser audit.
- The required `check` job audits affected sites' rendered HTML before deployment, using Alchemy's standalone build in disposable Miniflare Workers with local D1/R2/KV/Images. It seeds CMS content and serves seed images from the build assets, so no cloud preview or deploy credentials are needed. `.build-inputs.json` participates in the build cache key. Local SEO checks content; deployed SEO additionally checks stage indexing policy and response timing. Failed smoke/SEO reports remain available in logs and uploaded artifacts.
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
- PostHog project, Axiom token, real domains (for email + prod), GitHub repo for this monorepo.
- File Alchemy issues: supported custom Worker entry for `Website.Astro`; `config:` path bug; EmDash image endpoint support; SSR dep-optimizer instability under the workerd dev runner (stale chunks / duplicate React); dev proxy resetting curl connections.
- Extract `@jakebodea/*` toolkit; adopt in pcobooster (drop Infisical, add control-app, fake Planning Center, per-worktree stages) and shouldertap.
