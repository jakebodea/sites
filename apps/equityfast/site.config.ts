/**
 * Everything that makes this site *this* site (as opposed to the template):
 * identity, domain, lender facts for structured data, and contact routing.
 * Copy is NOT here: editors own it in EmDash (see seed/seed.json). Structurally
 * a `SiteIdentity` (checked where alchemy.run.ts passes it to `resolveStage`).
 */
/** Facts for the FinancialService JSON-LD and the footer. Leave unknown fields out rather than guessing. */
interface BusinessFacts {
  readonly legalName: string;
  readonly nmls: string;
  readonly email: string;
  readonly address: {
    readonly street: string;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string;
  };
  readonly instagram: string;
  readonly telephone?: string;
}

const business: BusinessFacts = {
  address: {
    city: "Santa Ana",
    postalCode: "92704",
    region: "CA",
    street: "3750 S Susan Street",
  },
  email: "Equityfast@emortgagecapital.com",
  instagram: "https://www.instagram.com/equityfast/",
  legalName: "E Mortgage Capital, Inc.",
  nmls: "1416824",
};

export const site = {
  business,

  description:
    "EquityFast, powered by E Mortgage Capital: HELOCs from $5K to $1M, no appraisal on eligible loans under $400K, FICO 620+, approvals in as little as 30 minutes.",

  /** Appended to meta descriptions too short for a search snippet (see `metaDescription`). */
  descriptionContext:
    "EquityFast home equity lines of credit, powered by E Mortgage Capital, Inc. NMLS #1416824.",

  /**
   * Attached as a custom domain on the `prod` stage only. Unset until the zone is
   * on the Cloudflare account (attaching an unowned domain fails the deploy), so
   * prod serves from workers.dev for now. Current site:
   * equityfast.emortgagecapital.com (a subdomain of the client's zone).
   */
  domain: null,

  /** Prefixes Worker names (`equityfast-<stage>`) and the Alchemy stack. */
  id: "equityfast",

  // The client's notification address, filled in when confirmed.
  leadInbox: null,

  /**
   * Public base URL EmDash downloads seed images from when the stage cannot
   * serve them itself (local workerd: EmDash's SSRF guard refuses localhost).
   * Deployed stages use their own `/_seed/media`. The seed files keep the
   * current site's asset names so they resolve there; switch to
   * `https://equityfast-prod.jakebodea.workers.dev/_seed/media` after the first
   * prod deploy.
   */
  localSeedMediaBase: "https://equityfast.emortgagecapital.com/assets",

  name: "EquityFast",

  shortName: "EquityFast",

  /** The Cloudflare account's workers.dev subdomain (non-prod stages live there). */
  workersSubdomain: "jakebodea",
} as const;
