/**
 * The contact-form pipeline every site shares:
 *
 *   validate -> verify Turnstile -> persist lead -> notify by email
 *
 * Persisting the lead is the point of no return. A failure before it (Turnstile
 * unavailable, the save itself) may lose the enquiry, so it is logged with the
 * lead and emailed to `ALERT_EMAIL`. A failure after it only logs: the lead is
 * safe in the CMS and the visitor still sees success.
 */
import { Cause, Config, Context, Effect, Layer, Option, Schema } from "effect";

import { Email } from "./email.ts";
import type { EmailAddress } from "./email.ts";
import { LeadStore } from "./leads.ts";
import type { Lead, LeadNotSaved } from "./leads.ts";
import type { TurnstileRejected, TurnstileUnavailable } from "./turnstile.ts";
import { Turnstile } from "./turnstile.ts";

export const LEAD_SUBMIT_FAILED = "lead submit failed";

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
  readonly requestId: string;
}

export interface LeadMailRoutes {
  readonly from: Option.Option<EmailAddress>;
  readonly inbox: Option.Option<string>;
  readonly alert: Option.Option<string>;
}

export class LeadMail extends Context.Service<LeadMail, LeadMailRoutes>()(
  "@jakebodea/cloudflare-kit/LeadMail"
) {}

export interface LeadFailure {
  readonly form: Omit<ContactForm, "turnstileToken">;
  readonly sourcePath: string;
  readonly requestId: string;
  readonly stage: "verify" | "save";
  readonly error: string;
}

const nonEmpty = (name: string) =>
  Config.String(name).pipe(
    Config.option,
    Config.map(Option.filter((value) => value !== ""))
  );

export const LeadMailFromConfig = Layer.effect(
  LeadMail,
  Effect.gen(function* leadMailFromConfig() {
    const from = yield* nonEmpty("LEAD_NOTIFY_FROM");
    const inbox = yield* nonEmpty("LEAD_NOTIFY_TO");
    const alert = yield* nonEmpty("ALERT_EMAIL");
    const name = yield* Config.String("LEAD_NOTIFY_FROM_NAME").pipe(
      Config.withDefault("Website")
    );
    return {
      alert,
      from: from.pipe(Option.map((address) => ({ email: address, name }))),
      inbox,
    };
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

export const leadFailureText = (failure: LeadFailure): string =>
  [
    `Request: ${failure.requestId}`,
    `Step: ${failure.stage}`,
    `Error: ${failure.error}`,
    "",
    leadNotificationText({ ...failure.form, sourcePath: failure.sourcePath }),
  ].join("\n");

const reportLeadFailure = Effect.fn("reportLeadFailure")(
  function* reportLeadFailure(failure: LeadFailure) {
    yield* Effect.logError(LEAD_SUBMIT_FAILED).pipe(
      Effect.annotateLogs({
        error: failure.error,
        lead: leadNotificationText({
          ...failure.form,
          sourcePath: failure.sourcePath,
        }),
        requestId: failure.requestId,
        step: failure.stage,
      })
    );
    const mail = yield* LeadMail;
    const email = yield* Email;
    yield* Option.match(Option.all({ from: mail.from, to: mail.alert }), {
      onNone: () => Effect.void,
      onSome: ({ from, to }) =>
        email
          .send({
            from,
            replyTo: failure.form.email,
            subject: `Lead submission failed [${failure.requestId}]`,
            text: leadFailureText(failure),
            to,
          })
          .pipe(
            Effect.catchCause(() =>
              Effect.logError("lead failure alert email failed").pipe(
                Effect.annotateLogs({ requestId: failure.requestId })
              )
            )
          ),
    });
  }
);

export const submitContact = Effect.fn("submitContact")(function* submitContact(
  form: ContactForm,
  request: ContactRequest
) {
  const turnstile = yield* Turnstile;
  const leads = yield* LeadStore;
  const email = yield* Email;
  const mail = yield* LeadMail;
  const { turnstileToken, ...details } = form;
  const failure = (
    stage: LeadFailure["stage"],
    error: string
  ): LeadFailure => ({
    error,
    form: details,
    requestId: request.requestId,
    sourcePath: request.sourcePath,
    stage,
  });
  const alertFailure =
    (stage: LeadFailure["stage"]) =>
    (
      cause: Cause.Cause<
        TurnstileRejected | TurnstileUnavailable | LeadNotSaved
      >
    ) => {
      const error = Cause.findErrorOption(cause);
      if (Option.isSome(error) && error.value._tag === "TurnstileRejected") {
        return Effect.void;
      }
      return reportLeadFailure(
        failure(stage, Option.isSome(error) ? error.value._tag : "Defect")
      );
    };
  yield* turnstile
    .verify({ remoteIp: request.remoteIp, token: turnstileToken })
    .pipe(Effect.tapCause(alertFailure("verify")));
  const lead: Lead = { ...details, sourcePath: request.sourcePath };
  const { id } = yield* leads
    .save(lead)
    .pipe(Effect.tapCause(alertFailure("save")));
  yield* Effect.annotateCurrentSpan("lead.id", id);
  yield* Option.match(Option.all({ from: mail.from, to: mail.inbox }), {
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
          Effect.catchCause(() =>
            Effect.logError("lead notification failed").pipe(
              Effect.annotateLogs({ leadId: id, requestId: request.requestId })
            )
          )
        ),
  });
  return { leadId: id };
});
