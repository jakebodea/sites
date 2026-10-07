# 3. Load published production presentation through fresh native setup

- Status: proposed
- Date: 2026-10-06

## Context

A developer or reviewer needs current public production copy and images while retaining the branch's schema and starter defaults. EmDash 1.1 snapshots omit relationship edges and can include published leads. Applying source SQL or copying accounts would cross ownership and privacy boundaries. Reapplying seeds to edited hosted stages would overwrite reviewer changes.

The native seed downloader owns destination media and its setup loop budgets work across requests. Plain external image URLs do not prove optimization: the current image endpoint reads keys from destination R2. Native seeds ignore entry SEO and skip forward reference aliases; publishing after a root data update can restore the seed revision.

## Decision

Use a purpose-limited production GET exporter, explicit site presentation policy, branch-native seed composition, disposable schema preflight, fresh native setup, and narrow SEO/reference completion before owner provisioning. See `packages/cloudflare-kit/src/emdash/published-content.ts` and `published-policy.json`. This draft requires the validation evidence described below before acceptance.

No hosted in-place refresh is provided. A completed hosted stage preserves edits, including when a later deploy bundles a new export. A fresh PR stage may opt in through the `production-content` label alongside `preview`. Required credential-free verification stays seed-only.

## Design

The exporter at `/_content/published` accepts GET with `PUBLISHED_CONTENT_EXPORT_TOKEN`. Its own trusted `STAGE` must be `prod`; no query can select a site, source or destination. It uses public EmDash live-data APIs with `includeDrafts: false`. Access Electric permits home/pages/projects/categories; MS permits home/pages/projects. Field, nested rendering block and portable-text policies are fixed separately from branch schema. Leads are excluded regardless of publication status, as are users, auth, invitations, revisions, receipts, plugins and private options. Only used menus, public title/tagline/site SEO and per-entry SEO are exported. References use collection/slug/locale identities rather than source IDs.

The Node/Bun control CLI fetches the fixed production origin and composes it into this branch's public `SeedFile`, validated with EmDash's public seed validator. Branch definitions, retained block versions, additive field defaults and starter-only blocks remain. Unsupported fields, required missing values, unavailable retained versions and missing semantic references fail preflight. A disposable public libSQL SQLite adapter applies the schema and seed, then validates stored media values and native blocks; no destination is activated first.

Only referenced public media on the approved production `/_emdash/api/media/file/**` path is downloaded. Native setup writes destination-owned R2 bytes. SEO-only assets use a hidden, nonroutable `published_assets` seed collection; this lets the same native downloader handle them without importing the media library. Completion requires ready destination media rows and existing storage objects. It remaps references and SEO in four-entry rounds with public root handlers; it never republishes. The completion endpoint has no client bundle/body/query, requires the destination bootstrap token, and permits only trusted dev/pr stages, with site identity checked. A native hidden marker binds the seed to its prepared plan before the first completion round. A persistent destination receipt makes completion idempotent; each response reports progress, so completion stops on stagnation rather than a fixed entry ceiling. Owner provisioning remains the destination's existing native flow.

Local `start/reset --content seed|prod` selects content. Seed is the default; a validated production plan is reused on later starts and restart retains the selection. `content refresh` fetches again, preflights before stopping the server, backs up the stopped isolated emulator, and rolls back plan, selection and emulator if native load or completion fails. Generated plans, exports, backups and evidence are ignored. Branch/schema changes are recomposed on an explicit reset; ordinary starts preserve local edits.

A plan digest in `.build-inputs.json` controls both the virtual completion bundle and native seed override, participates in Alchemy/Turbo cache dependencies, and keeps credential-free builds seed-only. Export credentials never enter plan/build artifacts. Optional missing exporter bindings disable export in build fixtures, without granting live access.

## Private setup and delivery

Set `PUBLISHED_CONTENT_EXPORT_TOKEN` once in the main checkout's private `.env` through the normal private configuration process; use a random token of at least 32 characters. Worktrees use the existing private env symlink/fallback, never a new tracked env file. `stacks/github.ts` writes this same private configuration to the production and preview GitHub environments. A separately authorized Alchemy control-plane deployment is required, followed by the normal CI production deployment to expose the authenticated exporter. No cloud action is part of this implementation task.

Then use `bun run app -- start --site access-electric --content prod`, `reset --content prod`, or `content refresh`. Add both `preview` and `production-content` to a same-repository PR for a fresh production-content hosted stage. Missing credentials, unavailable exporter, incompatible source or missing media fail explicitly; seed fallback is disabled. Recreate a preview only through separately authorized Alchemy destroy/deploy when a new copy is needed.

## Alternatives considered

- Native snapshots or source SQL: omit relations and cross the published-lead/account boundary.
- A general hosted reconciliation engine: unnecessary for a fresh-stage first flow; would require edit-conflict and rollback semantics.
- Unbounded applySeed: ignores native request budgets and does not complete SEO/references.
- External original images: render but do not establish destination image optimization.
- Generic CMS Admin tokens: grant capabilities unrelated to public export.

## Consequences and evidence

Fixed policies must change deliberately when public rendering fields or blocks change. Export fails when reference hydration is paginated rather than silently dropping edges. Current site fixtures are English-only; multilingual translation grouping is not proven. Fresh setup failures on hosted stages leave setup incomplete and do not provision an owner; repair/recreation requires normal Alchemy operations. Local rollback preserves the prior isolated copy, content selection, authentication and build inputs. Ordinary first startup preserves older local edits without provisioning a new owner. Seed resets reuse an owner-verified snapshot; reset retains CMS sign-in.

Validation uses real public SQLite adapters and disposable Worker/D1/R2 fixtures, never module mocks. Receipts/logs must distinguish SQLite checks, native media and optimized bytes, rendered relationships, owner preservation, smoke/SEO, and any unverified CLI rollback or hosted behavior. Deployed production-source verification remains a later delivery gate.
