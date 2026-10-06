---
name: proof
description: Produce a revision-bound proof receipt for a change (gates, verified flows, screenshots/video, verdict). Use when finishing a task, before opening or updating a PR, and when asked to prove a change works.
---

# Proof

A receipt binds the CI gates, the flows you exercised, and media hashes to one commit and patch. `verify` rejects it if the code, logs, media, or report change. Policy (risk tiers, visual paths, gates) is `proof.config.ts`.

1. Verify on the running site with `control-app` and keep the artifacts you looked at.
2. Commit (proof refuses a dirty tree).
3. Run:

```bash
bun run proof -- run --base origin/main \
  --flow "Contact form submits and shows the thank-you state" \
  --artifact ".artifacts/app/access-electric/<stage>/screens/contact-375.png#Contact form at 375px" \
  --note "Admin email delivery not verified: no verified sender in dev"
```

High-risk changes also need `--verifier-verdict PASS --verifier-summary "…" --verifier-source <reviewer>` (an independent reviewer, e.g. a subagent that re-ran the checks). Critical changes also need `--rollback "…"` and a `--focused-check "name::command"`.

4. `bun run proof -- verify --receipt <path>`; then `bun run proof -- publish --pr <n> --receipt <path>`.

Report the verdict and receipt path. `BLOCKED` means evidence is missing (see the receipt's notes); fix that rather than lowering `--risk`.
