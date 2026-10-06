# Marketing sites

A monorepo of client marketing sites. Each site is an Astro + EmDash CMS app on Cloudflare Workers, deployed with Alchemy v2. Server code is Effect 4. The reference site is `apps/access-electric`.

Full rationale for every choice: [docs/stack.md](docs/stack.md). Domain terms: [CONTEXT.md](CONTEXT.md).

## Map

| Path | What lives there |
| --- | --- |
| `apps/<site>/` | One site: `alchemy.run.ts` (its stack), `astro.config.ts`, `site.config.ts` (identity, domain, business facts), `seed/seed.json` (CMS schema + starting content), `src/` |
| `apps/jbolabs/` | The exception: Jake's own studio site has no CMS. Copy lives in `src/content/*.ts` and leads go to a D1 table |
| `apps/<site>/src/components/islands/` | The only client JS: shadcn React islands (nav, gallery, contact form) |
| `apps/<site>/src/components/ui/` | Vendored shadcn primitives. Add variants here; never restyle them at call sites |
| `packages/cloudflare-kit` | Shared code: Effect server services (`./server`), browser analytics (`./analytics/*`), Alchemy helpers (`./infra`), EmDash glue (`./emdash/*`) |
| `packages/control-app` | `bun run app -- …`: run, sign in, screenshot, record, smoke-test a site |
| `packages/proof` | `bun run proof -- …`: revision-bound proof receipts |
| `packages/config` | tsconfig + strict oxlint/oxfmt presets + local lint rules |
| `stacks/` | Repo-level Alchemy stacks: `github.ts` (CI control plane), `turbo-cache.ts` (remote cache) |
| `scripts/ci/` | Logic the GitHub workflows call (tested TypeScript, thin YAML) |

`packages/*` will move to the `@jakebodea/*` toolkit repo: never import from `apps/` into `packages/`.

## Commands

```bash
bun run app -- start        # alchemy dev for this worktree (own stage + port), warmed up (~15 s)
bun run app -- restart      # after server/island edits (~15 s)
bun run app -- reset        # fresh seeded data from a snapshot + CMS sign-in (~16 s)
bun run app -- smoke        # every sitemap page, 404, admin, images, contact action, cron
bun run app -- screenshot / /contact      # full-page PNGs at 1280 and 375
bun run app -- seo          # technical SEO audit of every page (see .agents/skills/seo)
bun run ci                  # lint (zero warnings) + typecheck + tests, cached by Turborepo
bun run build               # credential-free production build of every site
bun run proof -- run --flow "…" --artifact path#alt
bun run fix                 # format + autofix
bun --cwd apps/<site> run types   # regenerate emdash-env.d.ts after seed schema changes
```

The Alchemy profile comes from `ALCHEMY_PROFILE` (e.g. `ALCHEMY_PROFILE=admin`). Local dev uses only emulated resources; it still needs a profile to resolve the account.

## Never

- Never export `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` locally: use `alchemy profile`.
- Never deploy `prod` from a shell. Production deploys from CI on merge to `main`; the stack refuses otherwise.
- Never deploy, destroy, or change cloud resources without the user's explicit go-ahead for that action.
- Never touch infrastructure outside Alchemy. Every resource and every setting lives in an `alchemy.run.ts` or `stacks/` and changes only through `alchemy deploy`/`destroy`. No dashboard, Cloudflare MCP write tools, `wrangler`, or raw API calls that create, change, or delete resources or the data inside them (D1 rows, R2 objects, KV keys). Read-only inspection is fine, and so is using the site itself (the CMS, `app seed`/`reset`, the contact form). A broken stage is fixed in code and redeployed, or destroyed and redeployed.
- Never print or commit secrets. Real `.env` files live only in the main checkout.
- Never add `@cloudflare/vite-plugin`, wrangler config, or an Astro `adapter`: Alchemy owns that.
- Never run Effect in islands. Islands are plain React; Effect stays on the server.
- Never disable a lint rule inline without a `-- reason`. Fix the code first.
- Don't touch `packages/cloudflare-kit/src/emdash/alchemy-workarounds.ts` or the Vite `ssr.optimizeDeps` block in `astro.config.ts` without reading why each line exists; both keep EmDash working on Alchemy.

## Definition of done

1. `bun run ci` passes (zero lint warnings).
2. Verify on the running site, not by reasoning. Use the cheapest step that proves the change: nothing for templates/styles (hot reload), `restart` for server or island code, `reset` for seed/schema changes (table in the `control-app` skill). Then exercise it (`smoke`, `seo`, `screenshot`, `record`, `snapshot`, `login` + `--auth` for the CMS). Visible changes need screenshots at both widths.
3. Commit, then `bun run proof -- run` with every flow you checked and the artifacts. Report the verdict and receipt path, plus anything you could not verify. Never claim done without evidence.

## Decisions

- Hosting: every client site lives in Jake's Cloudflare account; hand off later with Alchemy adopt.
- CMS login: EmDash invites + passkeys. Finish EmDash setup right after the first prod deploy (whoever completes setup first becomes admin), then invite the client as **Editor**.
- Email: Cloudflare Email Service (`EMAIL_FROM` once a domain is verified); logged, not sent, until then.
- Analytics: PostHog, cookieless (`persistence: "memory"`), allowlisted events, no consent banner.
- Monitoring: Cloudflare Workers Logs/traces everywhere. No Axiom on client sites: a PostHog alert on the `lead submit failed` event is the one alert (see docs/stack.md).
- Backups: D1 Time Travel + daily dump of D1 and media into the retained `Backups` bucket (prod).
- Secrets: no Infisical/1Password. Main-checkout `.env`, GitHub environment secrets, `Alchemy.Random`.
- Stages: `dev-<worktree>` (local), `pr-<n>` (previews, destroyed on close), `prod` (custom domain; `<site>-prod.jakebodea.workers.dev` while `site.config.ts` has no `domain`, since attaching an unowned domain fails the deploy).

## Style

Ultracite (oxlint + oxfmt) is strict and the source of truth: see `.agents/skills/ultracite`. Project skills live in `.agents/skills/` (symlinked into `.claude/skills/`): `new-site`, `add-section`, `control-app`, `seo`, `deploy`, `proof`. Prefer Effect Schema at every I/O boundary, `Data`/`Schema.TaggedError` for failures, small focused modules, and comments that explain why, not what.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
