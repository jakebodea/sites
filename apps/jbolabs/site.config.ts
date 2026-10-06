/**
 * Everything that makes this site *this* site (as opposed to the template):
 * identity, domain, business facts for structured data, and contact routing.
 * Page copy lives in `src/content`. Structurally a `SiteIdentity` (checked
 * where alchemy.run.ts passes it to `resolveStage`).
 *
 * The brand name and domain are still provisional: renaming the studio means
 * changing `name`/`shortName`/`domain` here (and rerunning brand/render.py for
 * the share image). `id` names cloud resources, so it stays put once a stage
 * is deployed.
 */
/** Facts for ProfessionalService JSON-LD. Leave unknown fields out rather than guessing. */
interface BusinessFacts {
  readonly founder: string;
  readonly email?: string;
}

const business: BusinessFacts = {
  founder: "Jake Bodea",
};

export const site = {
  business,

  description:
    "JBO Labs is the independent web studio of Jake Bodea: websites, web apps, and technical consulting for small businesses.",
  /** Appended to meta descriptions too short for a search snippet (see `metaDescription`). */
  descriptionContext:
    "Websites, web apps, and technical consulting by Jake Bodea at JBO Labs.",
  /**
   * Attached as a custom domain on the `prod` stage only. Unset until the zone is
   * on the Cloudflare account (attaching an unowned domain fails the deploy), so
   * prod serves from workers.dev for now. Intended domain: jbolabs.com.
   */
  domain: null,
  /** Prefixes Worker names (`jbolabs-<stage>`) and the Alchemy stack. */
  id: "jbolabs",
  name: "JBO Labs",
  shortName: "JBO Labs",
  /** Footer line under the wordmark. */
  tagline: "Websites, web apps, and technical consulting for small businesses.",
  /** Home page `<title>`: "JBO Labs | <this>". */
  titleSuffix: "Websites, web apps, and consulting",
  /** The Cloudflare account's workers.dev subdomain (non-prod stages live there). */
  workersSubdomain: "jakebodea",
} as const;
