# Context

Shared vocabulary for this repo. Use these words; avoid the listed alternatives.

**Site**: one client's marketing website, an app under `apps/<site>` with its own Alchemy stack. _Avoid_: project (that is a CMS content type), app (ambiguous with products).

**Stage**: one deployed (or locally emulated) copy of a site's stack: `dev-<worktree>`, `pr-<n>`, `prod`, or a named stage like `ae-preview`. _Avoid_: environment (GitHub's word for its deploy gates), instance.

**Seed**: `seed/seed.json`: the CMS schema plus starting content a fresh stage boots with. _Avoid_: fixtures, sample data.

**Editor**: the EmDash role clients get: edits and publishes content, cannot change users or settings.

**Lead**: a contact-form submission, stored in the CMS `leads` collection and emailed to the business. _Avoid_: inquiry, message, contact.

**Island**: an interactive React component hydrated in an otherwise static Astro page.

**Proof**: a receipt from `bun run proof` binding gates and evidence to one commit. _Avoid_: screenshots alone, "verified".

**Control plane**: the repo-level stacks in `stacks/` (GitHub environments, deploy tokens, remote cache), as opposed to site stacks.

**Workaround**: one of the documented EmDash-on-Alchemy shims (Vite aliases, SSR pre-bundling). Each names the upstream gap it covers.

**Web Analytics**: Cloudflare's cookieless traffic measurement, one `Cloudflare.Rum.Site` per site on prod. _Avoid_: RUM (the API's name), PostHog (products only).

**Analytics plugin**: `@eisbachcode/emdash-plugin-analytics`, which shows Web Analytics numbers in the EmDash admin. Its settings come from Worker bindings.

**Lead alert**: the email to `ALERT_EMAIL` when a contact submission may be lost (Turnstile unavailable, the save failed). _Avoid_: lead notification (the email the client gets for every lead).

**ADR**: one dated decision record in `docs/adr/`. Superseded, never rewritten.
