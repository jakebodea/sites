---
name: deploy
description: Deploy, preview, tear down, or rotate credentials for sites in this repo. Use for any deploy, preview stage, cleanup, or CI credential question.
---

# Deploy

Always get the user's go-ahead before deploying or destroying anything.

| Stage | How | When |
| --- | --- | --- |
| `dev-<worktree>` | `bun run app -- start` | Local, emulated, any time |
| `pr-<n>` | CI on every PR from this repo | Destroyed when the PR closes; janitor sweeps leftovers daily |
| named preview | `cd apps/<site> && ALCHEMY_PROFILE=admin bun alchemy deploy --stage <name>` | Ad-hoc demos; destroy when done |
| `prod` | CI on merge to `main` only | The stack refuses prod outside CI |

```bash
cd apps/<site>
ALCHEMY_PROFILE=admin bun alchemy plan --stage <stage>      # read-only diff first
ALCHEMY_PROFILE=admin bun alchemy deploy --stage <stage>
ALCHEMY_PROFILE=admin bun alchemy destroy --stage <stage>   # non-prod buckets are force-emptied
bun run app -- smoke --url <stage url>
```

## CI control plane (once per repo, then to rotate)

```bash
ALCHEMY_PROFILE=admin bun alchemy deploy stacks/github.ts --stage ci          # environments, ruleset, deploy tokens
ALCHEMY_PROFILE=admin bun alchemy deploy stacks/turbo-cache.ts --stage shared # remote cache + TURBO_* in GitHub
```

Rotate deploy tokens: bump `deployTokens.generation` in `stacks/config.ts`, redeploy `stacks/github.ts`.

## Restore

D1 Time Travel: `bunx wrangler d1 time-travel restore <database> --timestamp <iso>`. Older than 30 days: gunzip a `Backups` bucket dump and `bunx wrangler d1 execute <database> --remote --file restore.sql`.
