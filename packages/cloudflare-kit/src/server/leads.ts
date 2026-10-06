import type { Effect } from "effect";
import { Context, Schema } from "effect";

/** A contact-form enquiry, validated and normalized. */
export const Lead = Schema.Struct({
  company: Schema.optional(Schema.String),
  email: Schema.String,
  message: Schema.String,
  name: Schema.String,
  phone: Schema.optional(Schema.String),
  /** Page the visitor submitted from, e.g. `/contact`. */
  sourcePath: Schema.String,
});
export type Lead = typeof Lead.Type;

export class LeadNotSaved extends Schema.TaggedError<LeadNotSaved>()(
  "LeadNotSaved",
  { cause: Schema.Defect() }
) {}

/** Where enquiries are persisted. Each site provides an implementation (EmDash, D1, ...). */
export class LeadStore extends Context.Service<
  LeadStore,
  {
    readonly save: (
      lead: Lead
    ) => Effect.Effect<{ readonly id: string }, LeadNotSaved>;
  }
>()("@jakebodea/cloudflare-kit/LeadStore") {}
