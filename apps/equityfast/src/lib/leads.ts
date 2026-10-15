import {
  LeadNotSaved,
  LeadStore,
  leadNotificationText,
} from "@jakebodea/cloudflare-kit/server";
import type { Lead } from "@jakebodea/cloudflare-kit/server";
import { Effect, Layer } from "effect";
import { withEmDashRuntime } from "emdash/middleware";

import { AMOUNT_QUESTION } from "./application.ts";

/**
 * Applications live in the EmDash `leads` collection ("Applications" in the
 * admin): the client reads them where they already edit the site. The
 * collection is not routable and entries stay drafts, so they never reach a
 * public page, sitemap, or query. The entry's text is the same summary the
 * notification email carries, so the two never disagree.
 *
 * Next step (not built): forward applications to E Mortgage Capital's own
 * intake (CRM/LOS) once they share its API, and only then collect the
 * sensitive fields the previous site asked for (see `application-rules.ts`).
 *
 * `withEmDashRuntime` is EmDash's trusted server-side entry point (public
 * routes get no write handlers on `locals`); input is validated by
 * `ApplicationForm` before it gets here.
 */
export const LeadStoreEmDash = Layer.succeed(LeadStore, {
  save: (lead: Lead) =>
    Effect.tryPromise({
      catch: (cause) => new LeadNotSaved({ cause }),
      try: async () =>
        await withEmDashRuntime(async (runtime) => {
          const amount = lead.answers?.find(
            ({ question }) => question === AMOUNT_QUESTION
          )?.answer;
          const result = await runtime.handleContentCreate("leads", {
            data: {
              amount: amount ?? null,
              email: lead.email,
              message: leadNotificationText(lead),
              phone: lead.phone ?? null,
              source_path: lead.sourcePath,
              title: lead.name,
            },
            status: "draft",
          });
          if (!result.success) {
            throw new Error(`${result.error.code}: ${result.error.message}`);
          }
          return { id: result.data.item.id };
        }),
    }).pipe(Effect.withSpan("LeadStore.save")),
});
