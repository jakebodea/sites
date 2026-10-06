import { LeadNotSaved, LeadStore } from "@jakebodea/cloudflare-kit/server";
import type { Lead } from "@jakebodea/cloudflare-kit/server";
import { Effect, Layer } from "effect";
import { withEmDashRuntime } from "emdash/middleware";

import { answerTo } from "./intake.ts";

/**
 * Leads live in the EmDash `leads` collection: the client reads them in the
 * admin they already use, with no extra inbox or database. The collection is
 * not routable and entries stay drafts, so they never reach a public page,
 * sitemap, or query.
 *
 * `withEmDashRuntime` is EmDash's trusted server-side entry point (public
 * routes get no write handlers on `locals`); input is validated by
 * `IntakeForm` before it gets here, and each intake answer is filed in its
 * own field so the admin list can show who referred whom, and at what budget.
 */
export const LeadStoreEmDash = Layer.succeed(LeadStore, {
  save: (lead: Lead) =>
    Effect.tryPromise({
      catch: (cause) => new LeadNotSaved({ cause }),
      try: async () =>
        await withEmDashRuntime(async (runtime) => {
          const result = await runtime.handleContentCreate("leads", {
            data: {
              budget: answerTo(lead.answers, "budget"),
              company: lead.company ?? null,
              email: lead.email,
              message: lead.message,
              referrer: lead.referrer ?? null,
              services: answerTo(lead.answers, "services"),
              source_path: lead.sourcePath,
              timeline: answerTo(lead.answers, "timeline"),
              title: lead.name,
              website: answerTo(lead.answers, "website"),
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
