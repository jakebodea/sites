# 2. The studio owns every client CMS Admin account

- Status: accepted
- Date: 2026-10-06

## Context

EmDash's native first-run setup lets the first visitor register the Admin passkey. Entering an email in that form does not prove control of its mailbox. CI previously seeded public sites and left this account unclaimed.

Jake owns the Admin account. Clients receive Editor invitations when Jake chooses to grant access. Public setup must never decide who owns a client site.

## Decision

`studio.cmsOwnerEmail` in `stacks/config.ts` names the owner, initially `jakebodea@gmail.com`. CI reserves that account immediately after content seeding. The owner signs in through EmDash's native email-link flow and can then register a passkey on their own device. Provisioning creates no credentials or sessions and leaves `email_verified` false.

Clients are invited explicitly as Editor, role 40. The shared policy rejects other invitation roles, legacy invitations above Editor, client promotion above Editor, and changes to the owner's identity, role, or enabled state.

## Design

The caller runs the existing `app seed --url <stage>` command with `CMS_BOOTSTRAP_TOKEN` supplied by CI. It applies starting content only while setup is incomplete, then verifies ownership on every invocation. An existing site's content is preserved.

`stacks/github.ts` generates separate preview and production bootstrap credentials through Alchemy and stores them as GitHub environment secrets. Site stacks bind their environment's credential, fixed owner email, and site ID. Local `alchemy dev` retains EmDash's compile-time dev bypass; a hosted stage name never enables that bypass.

`owner-gate.ts` runs before EmDash initialization. It closes first-admin registration, OAuth signup, domain signup, and dev bypasses in built Workers. Native seed mutation and the owner endpoint require the deploy credential. Public pages and the native login flow remain available.

The injected `/_emdash/api/setup/owner` endpoint accepts no caller-selected identity, role, passkey, or content. `owner.ts` requires persisted seed completion and inserts an Admin with a unique email and an HMAC provisioning receipt in the same row. The receipt binds the user ID, owner email, site ID, and stage to that environment's bootstrap credential. Concurrent calls reread the same account after an insert conflict. Setup completion is written last, so a retry can recover after interrupted provisioning.

An existing account without a valid receipt is a conflict, including an account with the configured email. The provisioner never promotes or adopts an account whose credentials may have been created through public setup. It also refuses a disabled owner or another Admin.

`owner-middleware.ts` runs after EmDash resolves session or bearer authentication. It enforces invitations, checks invitation tokens before native redemption, and protects account mutations. Native EmDash still owns authentication, token consumption, passkey verification, and session creation.

## Synthesis decision

Both design candidates recommended fixed-owner provisioning followed by native email-link login. The chosen design includes the early credential gate and continuing account policy from their assessments. It preserves native authentication rather than adding a second login system.

## Alternatives considered

- Secret-gated native passkey setup prevents public claims but requires manual enrollment for every site. The setup form still does not verify the email address.
- Verified OAuth requires provider configuration and a custom callback policy. The pinned native callback permits Admin signup while setup is incomplete.
- Pre-filling the owner email in public setup still lets a stranger register their own passkey against that email.

## Consequences

- First login depends on working CMS email delivery. A failed email delivery never reopens public setup.
- A change to the owner email requires an authenticated migration that preserves the user ID and credentials, verifies the new mailbox, and updates the receipt. Changing the setting alone deliberately fails ownership verification. Jake intends to move to `jake@jbolabs.com` after that mailbox is ready.
- Rotating a bootstrap credential requires a reviewed receipt migration for existing sites. Rotation must not silently adopt unsigned accounts.
- Existing accounts from before this policy require a reviewed adoption step. Fresh and seeded-but-unclaimed sites use the automatic flow.
