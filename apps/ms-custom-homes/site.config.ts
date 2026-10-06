/**
 * Everything that makes this site *this* site (as opposed to the template):
 * identity, domain, business facts for structured data, and contact routing.
 * Copy is NOT here: editors own it in EmDash (see seed/seed.json). Structurally
 * a `SiteIdentity` (checked where alchemy.run.ts passes it to `resolveStage`).
 */
/** Facts for HomeAndConstructionBusiness JSON-LD. Leave unknown fields out rather than guessing. */
interface BusinessFacts {
  readonly address: {
    readonly street: string;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string;
  };
  readonly areaServed: readonly string[];
  readonly email?: string;
  /** California requires the CSLB license number wherever a contractor advertises. */
  readonly license: string;
  readonly telephone?: string;
}

const business: BusinessFacts = {
  address: {
    city: "Irvine",
    postalCode: "92604",
    region: "CA",
    street: "15333 Culver Dr. #968",
  },
  areaServed: ["Orange County, CA"],
  email: "mscustomhomesinc@gmail.com",
  license: "CSLB Lic. #997076",
  telephone: "+1-949-279-1841",
};

export const site = {
  business,

  description:
    "Woman-owned custom home builder in Orange County. Custom homes, remodels, kitchens, and baths, built on budget and on time.",
  /** Appended to meta descriptions too short for a search snippet (see `metaDescription`). */
  descriptionContext:
    "Custom homes and remodels by MS Custom Homes, Inc. in Orange County, California.",
  /** Attached as a custom domain on the `prod` stage only. */
  domain: "mscustomhomesinc.net",
  /** Prefixes Worker names (`ms-custom-homes-<stage>`) and the Alchemy stack. */
  id: "ms-custom-homes",
  /**
   * Public base URL EmDash downloads seed images from when the stage cannot
   * serve them itself (local workerd: EmDash's SSRF guard refuses localhost).
   * Deployed stages use their own `/_seed/media`.
   */
  localSeedMediaBase:
    "https://ms-custom-homes-preview.jakebodea.workers.dev/_seed/media",
  name: "MS Custom Homes, Inc.",
  /** Display form of `business.telephone`. */
  phone: "949-279-1841",
  shortName: "MS Custom Homes",
  /** The Cloudflare account's workers.dev subdomain (non-prod stages live there). */
  workersSubdomain: "jakebodea",
} as const;
