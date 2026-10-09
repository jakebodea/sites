/**
 * Repository-level facts the control-plane stacks share. Not secrets:
 * account and repository identifiers are visible to anyone with access.
 */
export const repository = {
  /** Cloudflare account that hosts every site in this repo. */
  accountId: "984b82870acd18daf8bda97bad966b38",
  owner: "jakebodea",
  repository: "sites",
} as const;

/**
 * Deploy tokens are minted per generation. Bump `generation` to rotate: the
 * next `ci` deploy mints fresh tokens, writes them to GitHub, and deletes the
 * previous generation. Rotate before `expiresOn`.
 */
export const deployTokens = {
  expiresOn: "2027-10-05T23:59:59Z",
  generation: 1,
} as const;

/**
 * The studio domain (bought 2026-10-06, managed by `stacks/studio.ts` in the
 * jbolabs repo, which also runs the Mailflare inbox at inbox.jbolabs.com). Every
 * site sends lead notifications and alerts from `sender`, and alerts go to
 * `alertInbox`, which lands in that Mailflare inbox.
 */
export const studio = {
  alertInbox: "alerts@jbolabs.com",
  cmsOwnerEmail: "jakebodea@gmail.com",
  domain: "jbolabs.com",
  sender: "sites@mail.jbolabs.com",
  sendingSubdomain: "mail.jbolabs.com",
} as const;
