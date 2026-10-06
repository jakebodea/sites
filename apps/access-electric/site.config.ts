/**
 * Everything that makes this site *this* site (as opposed to the template):
 * identity, domain, business facts for structured data, and contact routing.
 * Copy is NOT here: editors own it in EmDash (see seed/seed.json). Structurally
 * a `SiteIdentity` (checked where alchemy.run.ts passes it to `resolveStage`).
 */
/** Facts for LocalBusiness/Electrician JSON-LD. Leave unknown fields out rather than guessing. */
interface BusinessFacts {
  readonly areaServed: readonly string[];
  readonly foundingYear: number;
  readonly email?: string;
  readonly telephone?: string;
}

const business: BusinessFacts = {
  areaServed: [
    "Ventura County, CA",
    "Los Angeles County, CA",
    "Riverside County, CA",
    "San Bernardino County, CA",
    "Orange County, CA",
    "San Diego County, CA",
  ],
  foundingYear: 2001,
};

export const site = {
  business,

  description:
    "Commercial electrical contractor serving Southern California since 2001. A Certified Women's Business Enterprise.",
  /** Appended to meta descriptions too short for a search snippet (see `metaDescription`). */
  descriptionContext:
    "Commercial electrical construction by Access Electric across Southern California.",
  /**
   * Attached as a custom domain on the `prod` stage only. Unset until the zone is
   * on the Cloudflare account (attaching an unowned domain fails the deploy), so
   * prod serves from workers.dev for now. Intended domain: accesselectricinc.com.
   */
  domain: null,
  /** Prefixes Worker names (`access-electric-<stage>`) and the Alchemy stack. */
  id: "access-electric",
  /**
   * Public base URL EmDash downloads seed images from when the stage cannot
   * serve them itself (local workerd: EmDash's SSRF guard refuses localhost).
   * Deployed stages use their own `/_seed/media`.
   */
  localSeedMediaBase: "https://accesselectricinc.com/media",
  name: "Access Electric, Inc.",
  shortName: "Access Electric",
  /** The Cloudflare account's workers.dev subdomain (non-prod stages live there). */
  workersSubdomain: "jakebodea",
} as const;
