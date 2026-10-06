/**
 * The contact-form pipeline every site shares:
 *
 *   validate -> verify Turnstile -> persist lead -> notify by email -> capture analytics
 *
 * Persisting the lead is the point of no return. After that, a failed email or
 * analytics call is logged and the visitor still sees success: the enquiry is
 * safe in the CMS either way.
 */
import { Config, Context, Effect, Layer, Option, Schema } from "effect";

import { Analytics } from "./analytics.ts";
import type { ServerEvent } from "./analytics.ts";
import { Email } from "./email.ts";
import type { EmailAddress } from "./email.ts";
import { LeadStore } from "./leads.ts";
import type { Lead } from "./leads.ts";
import { Turnstile } from "./turnstile.ts";

/** Logged and captured in PostHog when a submission fails; a PostHog alert watches for it. */
export const LEAD_SUBMIT_FAILED = "lead submit failed" satisfies ServerEvent;

const WHITESPACE = /\s/u;

/** One `@`, a non-empty local part, and a dotted domain. Deliverability is the reply's job. */
export const isEmailAddress = (value: string): boolean => {
  const at = value.indexOf("@");
  const domain = value.slice(at + 1);
  const hasSingleAt = at > 0 && !domain.includes("@");
  const dottedDomain =
    domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
  return hasSingleAt && dottedDomain && !WHITESPACE.test(value);
};

const trimmed = (min: number, max: number) =>
  Schema.Trim.check(Schema.isMinLength(min), Schema.isMaxLength(max));

const optionalTrimmed = (max: number) =>
  Schema.optional(Schema.Trim.check(Schema.isMaxLength(max)));

/** Most intake questions a site may add to its form. */
export const MAX_LEAD_ANSWERS = 8;

/**
 * A site-specific intake question and the visitor's answer (budget, timeline,
 * ...). Sites validate their own options before building these; the pipeline
 * only stores and forwards them.
 */
export const LeadAnswer = Schema.Struct({
  answer: trimmed(1, 200),
  question: trimmed(1, 80),
});
export type LeadAnswer = typeof LeadAnswer.Type;

/** What the browser sends. Field limits double as spam guards. */
export const ContactForm = Schema.Struct({
  /** The page view's PostHog ids, so the server event joins the visitor's session. */
  analytics: Schema.optional(
    Schema.Struct({
      distinctId: Schema.optional(Schema.String),
      sessionId: Schema.optional(Schema.String),
    })
  ),
  answers: Schema.optional(
    Schema.Array(LeadAnswer).check(Schema.isMaxLength(MAX_LEAD_ANSWERS))
  ),
  company: optionalTrimmed(120),
  email: Schema.Trim.check(
    Schema.isMaxLength(254),
    Schema.makeFilter((value: string) =>
      isEmailAddress(value) ? undefined : "Enter a valid email address"
    )
  ),
  message: trimmed(10, 5000),
  name: trimmed(2, 120),
  phone: optionalTrimmed(40),
  /** Who sent the visitor (a referral partner or past client), when they say. */
  referrer: optionalTrimmed(120),
  turnstileToken: Schema.String,
});
export type ContactForm = typeof ContactForm.Type;

/** Request facts the pipeline needs, read from headers by the site. */
export interface ContactRequest {
  readonly sourcePath: string;
  readonly remoteIp?: string;
  readonly distinctId?: string;
  readonly sessionId?: string;
}

/** Who is told about new leads; absent until the site has a verified sending domain. */
export class LeadInbox extends Context.Service<
  LeadInbox,
  Option.Option<{ readonly from: EmailAddress; readonly to: string }>
>()("@jakebodea/cloudflare-kit/LeadInbox") {}

const nonEmpty = (name: string) =>
  Config.String(name).pipe(
    Config.option,
    Config.map(Option.filter((value) => value !== ""))
  );

/**
 * Reads `LEAD_NOTIFY_FROM` (a verified sender) and `LEAD_NOTIFY_TO`; both must
 * be set to enable notifications. `LEAD_NOTIFY_FROM_NAME` names the sender.
 */
export const LeadInboxFromConfig = Layer.effect(
  LeadInbox,
  Effect.gen(function* leadInboxFromConfig() {
    const from = yield* nonEmpty("LEAD_NOTIFY_FROM");
    const to = yield* nonEmpty("LEAD_NOTIFY_TO");
    const name = yield* Config.String("LEAD_NOTIFY_FROM_NAME").pipe(
      Config.withDefault("Website")
    );
    return Option.all({ from, to }).pipe(
      Option.map((inbox) => ({
        from: { email: inbox.from, name },
        to: inbox.to,
      }))
    );
  })
);

export const leadNotificationText = (lead: Lead): string =>
  [
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone ?? "-"}`,
    `Company: ${lead.company ?? "-"}`,
    ...(lead.referrer === undefined ? [] : [`Referred by: ${lead.referrer}`]),
    ...(lead.answers ?? []).map(
      ({ answer, question }) => `${question}: ${answer}`
    ),
    `Page: ${lead.sourcePath}`,
    "",
    lead.message,
  ].join("\n");

export const submitContact = Effect.fn("submitContact")(function* submitContact(
  form: ContactForm,
  request: ContactRequest
) {
  const turnstile = yield* Turnstile;
  const leads = yield* LeadStore;
  const email = yield* Email;
  const inbox = yield* LeadInbox;
  const analytics = yield* Analytics;

  yield* turnstile.verify({
    remoteIp: request.remoteIp,
    token: form.turnstileToken,
  });

  const lead: Lead = {
    answers: form.answers,
    company: form.company,
    email: form.email,
    message: form.message,
    name: form.name,
    phone: form.phone,
    referrer: form.referrer,
    sourcePath: request.sourcePath,
  };
  const { id } = yield* leads.save(lead);
  yield* Effect.annotateCurrentSpan("lead.id", id);

  yield* Option.match(inbox, {
    onNone: () =>
      Effect.logInfo("lead saved; email notifications are not configured"),
    onSome: ({ from, to }) =>
      email
        .send({
          from,
          replyTo: lead.email,
          subject:
            lead.referrer === undefined
              ? `New enquiry from ${lead.name}`
              : `New enquiry from ${lead.name} (via ${lead.referrer})`,
          text: leadNotificationText(lead),
          to,
        })
        .pipe(
          Effect.catchTag("EmailFailed", (error) =>
            Effect.logError("lead notification failed", error)
          )
        ),
  });

  yield* analytics.capture({
    distinctId: request.distinctId,
    event: "lead submitted",
    properties: { source_path: lead.sourcePath },
    sessionId: request.sessionId,
  });

  return { leadId: id };
});

/**
 * For a submission that failed after validation and Turnstile: the visitor's
 * enquiry may be lost, so it is logged and captured for the PostHog alert.
 */
export const reportLeadFailure = Effect.fn("reportLeadFailure")(
  function* reportLeadFailure(error: { readonly _tag: string }) {
    yield* Effect.logError(LEAD_SUBMIT_FAILED, error);
    const analytics = yield* Analytics;
    yield* analytics.capture({
      event: LEAD_SUBMIT_FAILED,
      properties: { error: error._tag },
    });
  }
);
