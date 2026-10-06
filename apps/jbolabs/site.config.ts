/**
 * Everything that makes this site *this* site (as opposed to the template):
 * identity, domain, business facts for structured data, and contact routing.
 * Copy is NOT here: it lives in EmDash (see seed/seed.json). Structurally a
 * `SiteIdentity` (checked where alchemy.run.ts passes it to `resolveStage`).
 *
 * The brand name and domain are still provisional: renaming the studio means
 * changing `name`/`shortName`/`domain` here and `settings.title` in the seed
 * (or Settings in the CMS on a running stage). `id` names cloud resources, so
 * it stays put once a stage is deployed.
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
    "JBO Labs is the independent web studio of Jake Bodea: websites, web apps, and technical consulting for small teams.",
  /** Appended to meta descriptions too short for a search snippet (see `metaDescription`). */
  descriptionContext:
    "Websites, web apps, and technical consulting by Jake Bodea at JBO Labs.",
  /** Attached as a custom domain on the `prod` stage only. */
  domain: "jbolabs.com",
  /** Prefixes Worker names (`jbolabs-<stage>`) and the Alchemy stack. */
  id: "jbolabs",
  /** The seed ships no images, so this is never fetched; kept for the shared stack shape. */
  localSeedMediaBase: "https://jbolabs.com/_seed/media",
  name: "JBO Labs",
  shortName: "JBO Labs",
  /** The Cloudflare account's workers.dev subdomain (non-prod stages live there). */
  workersSubdomain: "jakebodea",
} as const;
