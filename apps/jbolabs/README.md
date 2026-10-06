# JBO Labs

Jake's own studio site. Unlike the client sites it has no CMS: every word lives in code.

| To change | Edit |
| --- | --- |
| Name, tagline, domain, contact facts | `site.config.ts` |
| Home page sections | `src/content/home.ts` |
| About, contact, privacy copy | `src/content/pages.ts` |
| Header and footer links | `src/content/navigation.ts` |
| Intake form options (services, budgets, timelines) | `src/lib/intake-options.ts` |
| Share image and favicons | `brand/render.py`, then commit `public/` |

Headlines take `*emphasis*` for the serif italic accent.

## Referrals

Send referrers a link like `https://<site>/?ref=Alex-Rivera`. The name is remembered for the visit and prefills the intake form's "Referred by" field. The lead email subject names the referrer.

## Leads

Each enquiry is written to the `leads` table in the site's D1 database, then emailed to `LEAD_NOTIFY_TO` once `EMAIL_FROM` is a verified sender (until then the email is only logged). Read leads with a D1 `SELECT`.

## Domain

`domain` is `null` until the zone is on the Cloudflare account, so prod serves from `https://jbolabs-prod.jakebodea.workers.dev`. Set it (for example `"jbolabs.com"`) and merge; the next prod deploy attaches it.
