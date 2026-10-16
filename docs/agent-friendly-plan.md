# Agent-friendly plan

Make the easy path the right path. When agents (or humans) slip, fix it as high in the stack as possible: **codebase → static analysis → prose → review**.

This plan is evidence from `jbolabs/sites` history through 2026-10-16. **58% of commits (97/166)** carry `Co-Authored-By: Claude …`; every merged PR is opened by Jake, so agent mistakes show up as follow-up commits and guard PRs, not as third-party PR threads.

---

## Recurring pitfalls (ranked)

| # | Pitfall | Evidence | Best fix (layer) | Effort | Leverage |
| --- | --- | --- | --- | --- | --- |
| 1 | **Claiming done without exercising the real site** (smoke green on empty/broken pages, missing visual regressions) | PR [#39](https://github.com/jbolabs/sites/pull/39) (`25fb091`): smoke passed header/footer-only CMS; added `<h1>` gate. PR [#36](https://github.com/jbolabs/sites/pull/36) (`b1b0641`): hero tagline pill and favicons restored after build passed without anyone looking. PR [#40](https://github.com/jbolabs/sites/pull/40) proof used a **disposable production Worker** because dev admin would not load. | **Static:** extend smoke (`pageVerdict`) with a minimum main-body signal (e.g. visible text length or block count from snapshot), not only `<h1>`. **Static:** commit the PR #40 `production-css-isolation` focused check into `proof.config.ts` / `scripts/ci/` (it lived only under `.artifacts/` for that receipt). **Prose:** add `.agents/skills/verify/SKILL.md` (below). **Process:** PR template field for proof receipt path (enforced by habit until a bot exists). | M | **Highest** |
| 2 | **Admin / assistant surface leaking into public pages** | PR [#40](https://github.com/jbolabs/sites/pull/40) (`25f11af`): global assistant CSS referenced Kumo tokens on public EquityFast pages. PR [#34](https://github.com/jbolabs/sites/pull/34)–[#35](https://github.com/jbolabs/sites/pull/35): assistant UI grew in shared kit. | **Codebase:** keep admin-only CSS injection in `emdash/admin/client` mount only (done in `25f11af`). **Static:** oxlint `no-restricted-imports` (or local rule): `apps/*/src/**` may not import `@jakebodea/cloudflare-kit/emdash/admin/client` or assistant stylesheets; only worker/admin entrypoints. **Static:** production build + Playwright check that public HTML links no `assistant*.css` and computed section backgrounds match fixture (promote PR #40 verifier). | M | **Highest** |
| 3 | **Copy-paste from `access-electric` without re-identifying the site** | `8133277`: EquityFast `alchemy.run.ts` still said "Access Electric infrastructure". `dd7d6cc`: unused `images.ts` / `textarea` copied from reference. `new-site` skill step 1 is manual copy. | **Codebase:** `bun run new-site -- <id>` script (or Turborepo generator) that copies, rewrites `package.json` name, `site.config.ts`, and the `alchemy.run.ts` header from `site.name`, and deletes seed media — one command instead of 9 error-prone edits. **Static:** `check-scaffold.ts` in `check:markup`: for each `apps/<site>/`, header comment in `alchemy.run.ts` must contain `site.id` or `site.name` from `site.config.ts` (prototype on `cursor/prototype-scaffold-check-9e21`). | M | High |
| 4 | **Destructive CMS assistant edits** (live slug changes, partial `blocks` wiping sections) | `ceba99b`, `850999a`, `465db6d` (+ tests in `agent.test.ts`). Motivated by live testing: model sent one section and would have dropped three. | **Codebase:** keep guards in `tools.ts` (done). **Static:** property tests that every refused tool arg stays refused; add golden fixtures per tool. **Codebase (higher):** EmDash MCP wrapper that merges `blocks` server-side for section-scoped updates so the model cannot accidentally replace the whole field — reduces guard surface. | L (merge) / M (wrapper) | High |
| 5 | **Design rules violated** (eyebrows, blurred sticky header) | PR [#30](https://github.com/jbolabs/sites/pull/30) (`e4bbe79`, `166a93b`); enforced by `packages/config/check-style.ts` + `check:markup`. | **Already at layer 2.** **Static:** extend `check-style` with one more rule agents hit often: e.g. flag `header` + `flex-shrink` on logo/nav children (PR [#39](https://github.com/jbolabs/sites/pull/39) Spanish overlap). **Codebase:** shared `SiteHeader` layout primitive with safe flex defaults for i18n nav width. | S–M | Medium |
| 6 | **Dev boot / SSR wedge** (6.5 min cold boot, `FontFamilyNotFound`, duplicate React) | PR [#38](https://github.com/jbolabs/sites/pull/38) (`d653000`, `e5f23a2`, `2fa96ac`): nine runtime dep discoveries; local state store misuse. Documented in `control-app` skill + `ssrPrebundle()`. | **Codebase:** `ssrPrebundle()` per site (done). **Static:** CI test that `astro.config.ts` `ssr.optimizeDeps.include` equals `ssrPrebundle(...)` output (snapshot). **Codebase:** `control-app start` fails fast with actionable message if wedge detected twice in 120s (partially done). | S | Medium |
| 7 | **Tests that cannot fail** | PR [#23](https://github.com/jbolabs/sites/pull/23), [#24](https://github.com/jbolabs/sites/pull/24) (`f175998`, `daa8005`): `oxlint-plugin-test-quality.ts` + AGENTS.md. | **Already at layer 2.** **Static:** extend rules to Astro component tests if any are added; keep `anti-slop/no-module-mocking`. | S | Medium (sustaining) |
| 8 | **Infrastructure outside Alchemy / wrong analytics stack** | ADR [0001](adr/0001-client-site-analytics-and-alerting.md): PostHog + Axiom broke prod (`jbolabs` deploy) and were not code-managed. `1a63019` "Infrastructure changes only through Alchemy". | **Codebase:** kit owns crossings (done per ADR). **Static:** knip or custom rule: no `@posthog/*`, `@axiomhq/*` in `apps/` or `packages/cloudflare-kit/src/server`. **Prose:** keep in AGENTS.md Never list (already there). | S | Medium |
| 9 | **Over-custom animation / motion churn** | `26367ee` revert after 6 agent commits on jbolabs mobile menu (`cdd6333`…`7bc93cb`). | **Codebase:** site-specific motion stays in `packages/site-ui` slots; sites pass classes only. **Prose:** ultracite skill already bans `transition-colors`; add "prefer shared menu motion defaults" to `site-ui` README. **Review:** treat large CSS animation diffs as high-risk in `proof.config.ts` visual paths. | S | Low–medium |
| 10 | **Responsive / locale layout bugs** | PR [#39](https://github.com/jbolabs/sites/pull/39): Spanish nav at 1280px. PR [#28](https://github.com/jbolabs/sites/pull/28): bilingual EquityFast. | **Static:** smoke screenshot at 1280 for `/` and `/es` when `site.config` lists `locales.length > 1`. **Codebase:** optional `site.config` `smoke.viewports` for known tight headers. | M | Medium |
| 11 | **Weak proof / skipped gates on critical paths** | `proof.config.ts` tiers; PR [#40](https://github.com/jbolabs/sites/pull/40) critical + independent verifier. `docs/stack.md` agent self-verification section. | **Static:** `bun run proof -- doctor` in CI on PRs that touch `risk.critical` paths (advisory → required). **Prose:** single verify skill (below) linking risk tier → commands. | S | Medium |
| 12 | **Duplicate / bloated agent prose** | `AGENTS.md` has two **Tests** sections (lines 55–57 and 69–73). Agents read the file twice and may miss Definition of done. | **Prose only:** merge Tests sections; link to `oxlint-plugin-test-quality` once. Trim stack duplication already covered by `docs/stack.md`. | S | Low |

---

## Proposed skill: `verify` (no `verify-*` skill exists today)

**Path:** `.agents/skills/verify/SKILL.md`  
**Trigger:** Any task before "done", PR open, or after `restart` / `reset`.

**Decision tree (cheapest proof first):**

1. `bun run ci` — always.
2. Pick control-app step from the table in `control-app` skill (hot reload vs `restart` vs `reset`).
3. `bun run app -- smoke` (and `seo` for routing/meta/copy).
4. Visible change → `screenshot` every affected path at **1280 and 375**; read PNGs.
5. Risk from `proof.config.ts`:
   - **medium+** visual → attach artifacts to proof.
   - **high/critical** → `--verifier-verdict` and focused checks (e.g. production CSS isolation).
6. `bun run proof -- run …` → `verify` → `publish --pr N`.

**Bilingual sites:** add `screenshot /es` (and smoke at 1280) when `site.config` has multiple locales.

**Deployed-only checks:** Turnstile, passkeys, custom domain — document as explicit `--note` limitations in proof.

---

## Prototype branches (open questions answered in code, not in chat)

| Branch | Question | Result |
| --- | --- | --- |
| `cursor/prototype-scaffold-check-9e21` | Can we catch wrong `alchemy.run.ts` headers without a full generator? | Small `check-scaffold.ts` wired into `check:markup`; fails if comment block lacks `site.name` / `site.id`. |

(Product implementation of ranked fixes stays on separate PRs; this plan PR is docs-only.)

---

## What is already working (do not re-litigate)

- Inverse-pyramid moves already shipped: `check-style.ts` / `check-copy.ts` (#30), test-quality oxlint (#24), `ssrPrebundle` (#38), assistant tool guards (`465db6d`, `ceba99b`), smoke `<h1>` (#39), admin CSS isolation (#40), proof receipts + risk tiers.
- `control-app` and `proof` skills are strong; the gap is **consistent use**, not missing CLIs.
- pstack skills (`poteto-mode`, `correct`, `architect`) are **not** in this environment; same ideas applied manually above.

---

## Suggested implementation order

1. **#1 + #2:** Promote production CSS verifier + tighten smoke/snapshot content gates (prevents critical visual/regression escapes).
2. **#3:** Scaffold check or `new-site` generator (stops identity copy-paste).
3. **#4:** EmDash `blocks` merge API (reduces assistant foot-gun surface).
4. **verify skill + AGENTS.md dedupe** (cheap prose).
5. **#5–#11** as touched by site work.

---

## References

- Plan PR: (this branch)
- Key commits: `25fb091`, `25f11af`, `b1b0641`, `d653000`, `465db6d`, `ceba99b`, `8133277`, `26367ee`, `1a63019`, `f175998`
- Key PRs: [#23](https://github.com/jbolabs/sites/pull/23), [#24](https://github.com/jbolabs/sites/pull/24), [#30](https://github.com/jbolabs/sites/pull/30), [#36](https://github.com/jbolabs/sites/pull/36), [#38](https://github.com/jbolabs/sites/pull/38), [#39](https://github.com/jbolabs/sites/pull/39), [#40](https://github.com/jbolabs/sites/pull/40)
