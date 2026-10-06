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
