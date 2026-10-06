/**
 * Outbound email behind one interface. Sites use Cloudflare Email Service once
 * their domain is verified; until then, the logging implementation records
 * what would have been sent and the lead is still stored in the CMS.
 */
import { Context, Effect, Layer, Schema } from "effect";

export interface EmailAddress {
  readonly email: string;
  readonly name: string;
}

export interface EmailMessage {
  readonly from: EmailAddress;
  readonly to: string;
  readonly cc?: readonly string[];
  readonly replyTo?: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export class EmailFailed extends Schema.TaggedError<EmailFailed>()(
  "EmailFailed",
  { cause: Schema.Defect() }
) {}

export class Email extends Context.Service<
  Email,
  { readonly send: (message: EmailMessage) => Effect.Effect<void, EmailFailed> }
>()("@jakebodea/cloudflare-kit/Email") {}

/** The subset of Cloudflare's `send_email` binding this module uses (its builder form). */
export interface CloudflareEmailBinding {
  readonly send: (message: EmailMessage) => Promise<object>;
}

/** Sends through a Cloudflare Email Service binding (requires a verified sending domain). */
export const emailCloudflare = (binding: CloudflareEmailBinding) =>
  Layer.succeed(Email, {
    send: (message) =>
      Effect.tryPromise({
        catch: (cause) => new EmailFailed({ cause }),
        try: async () => await binding.send(message),
      }).pipe(Effect.asVoid, Effect.withSpan("Email.send")),
  });

/** Logs the message instead of sending it; the default until a domain is verified. */
export const EmailLog = Layer.succeed(Email, {
  send: (message) =>
    Effect.logInfo("email not sent: no verified sending domain").pipe(
      // Never log bodies: CMS mail carries sign-in links.
      Effect.annotateLogs({ subject: message.subject, to: message.to })
    ),
});
