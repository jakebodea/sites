---
name: control-app
description: Run and drive a marketing site to verify a change on the real rendered surface. Use after any change to pages, components, CMS content, the contact form, or server code, and before claiming a task is done.
---

# Control the app

Everything runs locally under `alchemy dev` with emulated D1/R2/KV (no cloud resources). Each worktree gets its own stage and port, so parallel agents never collide. Output is JSON; files land in `.artifacts/app/<site>/<stage>/`.

## Run

```bash
ALCHEMY_PROFILE=admin bun run app -- start    # start or reuse the server (~15 s warm, ~70 s first ever)
bun run app -- restart                        # ~15 s: after server/island edits break hot reload
bun run app -- reset                          # ~16 s: fresh seeded data + signed-in CMS session
bun run app -- status | stop | logs --lines 120
```

Pick the cheapest step that proves your change:

| You changed | Do |
| --- | --- |
| Templates, styles, copy, components | nothing: the running server hot-reloads; go straight to Verify |
| Server code, islands, `astro.config.ts`, `alchemy.run.ts` | `restart` |
| `seed/`, CMS schema, or local data looks wrong | `reset` |

`reset` restores a snapshot of the seeded data (`.artifacts/app/<site>/<stage>/seeded-<hash>`); the first reset after a seed or dependency change seeds for real (~45 s, it downloads every seed image) and saves a new snapshot. Vite's dependency cache is kept across restarts; `start` clears it only to recover a boot that came up broken. Add `--site <name>` when the repo has several sites and you are not inside `apps/<site>`.

## Verify

```bash
bun run app -- smoke                                   # ~4 s: pages, 404, admin, images, contact action, cron
bun run app -- seo                                     # ~2 s: technical SEO audit of every page
bun run app -- screenshot / /about /contact            # 1280 + 375 full-page PNGs (lazy images loaded)
bun run app -- screenshot /_emdash/admin --auth        # signed in as the dev admin
bun run app -- snapshot /contact                       # accessibility tree: labels, roles, headings
bun run app -- record /portfolio --width 375           # WebM scroll-through for proof
bun run app -- smoke --url https://<site>-pr-12.<sub>.workers.dev   # a deployed stage
```

Read every screenshot you take; check both widths. `brokenImages` and `consoleErrors` in the screenshot report must be empty for pages you changed.

## Gotchas

- Sites without `seed/seed.json` keep their content in code (no EmDash, e.g. `jbolabs`): smoke skips the CMS admin check, `seed` is a no-op, `reset` just wipes local D1/KV and restarts, and `login`/`--auth` do not apply.

- A cold start (no Vite cache) optimizes dependencies on the first requests; `start` waits until three clean rounds pass, retrying once from a clean cache if the boot wedges. A 500 seconds after a manual `alchemy dev` is usually that, not your change.
- Every control-app request has a 20 s deadline (`src/http.ts`): a dev page can answer 200 and never finish streaming. Lint blocks a bare `fetch` in control-app.
- After editing server or island code, Astro's dev SSR can hot-reload into two React copies ("Invalid hook call", pages 500 or empty). Run `bun run app -- restart`; it is not your bug.
- Use `bun run app -- …` or `fetch`, not `curl`, against local dev: Alchemy's dev proxy resets curl connections after the headers, so curl shows `200` with an empty body.
- `login` uses EmDash's dev-only bypass. Deployed stages use real passkeys: verify public pages there.
- Turnstile uses Cloudflare's always-pass test keys locally; real widgets exist only on deployed stages.
