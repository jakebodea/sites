---
name: verify
description: Prove a change on the real running site before claiming done or opening a PR. Use after any code, content, or infra edit; pairs control-app with proof receipts.
---

# Verify

Agents stop here before "done". Read `control-app` and `proof` skills for command details.

## Steps

1. `bun run ci`
2. Pick the cheapest control-app step (`nothing` / `restart` / `reset`) from the table in `control-app`.
3. `bun run app -- smoke` and `bun run app -- seo` on every affected site.
4. Visible change → `screenshot` each path at **1280** and **375**; read the PNGs.
5. Risk from `proof.config.ts`:
   - **medium+** with visual paths → attach screenshots to proof.
   - **high/critical** → `--verifier-verdict PASS` and any focused checks below.
6. `bun run proof -- run --base origin/main …` → `verify` → `publish --pr N`.

## Focused checks

| Name | When | Command |
| --- | --- | --- |
| `production-css-isolation` | Touches `packages/cloudflare-kit/src/emdash/admin/**` or admin client CSS | After `ASTRO_STANDALONE_BUILD=1 bun --cwd apps/equityfast run build`, `bun scripts/ci/public-admin-css-isolation.ts equityfast` |

Pass to proof as `--focused-check "production-css-isolation::bun scripts/ci/public-admin-css-isolation.ts equityfast"`.

## Limits

Document in proof `--note` anything you could not run (passkeys on prod, Turnstile on deployed stages, etc.).
