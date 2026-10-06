---
name: deploy
description: Deploy, preview, tear down, or rotate credentials for sites in this repo. Use for any deploy, preview stage, cleanup, or CI credential question.
---

# Deploy

Always get the user's go-ahead before deploying or destroying anything.

**Alchemy is the only way infrastructure changes.** Resources, their settings, and their data change only through a stack (`apps/<site>/alchemy.run.ts`, `stacks/`) and `alchemy deploy`/`destroy`. Never use the dashboard, Cloudflare MCP write tools (D1 queries that write, bucket/KV/worker create or delete), `wrangler`, or raw API calls to create, edit, or delete anything, including rows in a stage's D1. Reading (listing resources, `SELECT` queries, logs) is fine, and so is going through the site's own app and APIs (the CMS admin, `bun run app -- seed`/`reset`). If something needs to change, change the stack and redeploy.

| Stage | How | When |
| --- | --- | --- |
| `dev-<worktree>` | `bun run app -- start` | Local, emulated, any time |
| `pr-<n>` | CI on same-repo PRs labeled `preview`, affected sites only | Destroyed on label removal or PR close; janitor sweeps leftovers daily |
| named preview | `cd apps/<site> && ALCHEMY_PROFILE=admin bun alchemy deploy --stage <name>` | Ad-hoc demos; destroy when done |
| `prod` | CI on merge to `main` only | The stack refuses prod outside CI |

```bash
cd apps/<site>
ALCHEMY_PROFILE=admin bun alchemy plan --stage <stage>      # read-only diff first
ALCHEMY_PROFILE=admin bun alchemy deploy --stage <stage>
ALCHEMY_PROFILE=admin bun alchemy destroy --stage <stage>   # non-prod buckets are force-emptied
bun run app -- smoke --url <stage url>
```

## When a deployed stage misbehaves

1. Read its logs: `cd apps/<site> && ALCHEMY_PROFILE=admin bun alchemy logs --stage <stage> --since 1h` (`--tail` to stream, `-r Website` to filter).
2. Fix the cause in code (the stack, `@jakebodea/cloudflare-kit/infra`, or the site) and redeploy.
3. If the stage's data is wedged (for example EmDash answering "EmDash is not initialized" because a cancelled request left its migration lock held), ask, then `alchemy destroy --stage <stage>` and deploy it again. Do not edit tables to unstick it.

Known causes: seed images missing on deployed stages came from Workers' same-zone `fetch()` going to the (nonexistent) `workers.dev` origin; `WORKER_COMPATIBILITY` now sets `global_fetch_strictly_public`. A stuck migration lock came from `app seed` aborting a slow first setup request; setup requests now get 180 s.

## CI control plane (once per repo, then to rotate)

```bash
ALCHEMY_PROFILE=admin bun alchemy deploy stacks/github.ts --stage ci          # environments, ruleset, deploy tokens
ALCHEMY_PROFILE=admin bun alchemy deploy stacks/turbo-cache.ts --stage shared # remote cache + TURBO_* in GitHub
```

Rotate deploy tokens: bump `deployTokens.generation` in `stacks/config.ts`, redeploy `stacks/github.ts`.

## Restore

D1 Time Travel: `bunx wrangler d1 time-travel restore <database> --timestamp <iso>`. Older than 30 days: gunzip a `Backups` bucket dump and `bunx wrangler d1 execute <database> --remote --file restore.sql`.
