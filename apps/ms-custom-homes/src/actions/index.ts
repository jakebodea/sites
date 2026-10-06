import {
  ContactForm,
  reportLeadFailure,
  runRequest,
  submitContact,
} from "@jakebodea/cloudflare-kit/server";
import { ActionError, defineAction } from "astro:actions";
import { Cause, Effect, Exit, Schema } from "effect";

import { contactLayer, waitUntil } from "@/lib/server";

const header = (request: Request, name: string) =>
  request.headers.get(name) ?? undefined;

export const server = {
  /** The contact form. Validation lives in `ContactForm` (Effect Schema), not here. */
  contact: defineAction({
    accept: "json",
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Astro hands over the raw JSON body; it is decoded with Effect Schema on the next line.
    handler: async (input: unknown, context) => {
      const { request } = context;
      const program = Schema.decodeUnknownEffect(ContactForm)(input).pipe(
        Effect.flatMap((form) =>
          submitContact(form, {
            distinctId:
              header(request, "x-posthog-distinct-id") ??
              form.analytics?.distinctId,
            remoteIp: header(request, "cf-connecting-ip"),
            sessionId:
              header(request, "x-posthog-session-id") ??
              form.analytics?.sessionId,
            sourcePath: new URL(request.headers.get("referer") ?? context.url)
              .pathname,
          })
        ),
        Effect.tapError((error) =>
          error._tag === "SchemaError" || error._tag === "TurnstileRejected"
            ? Effect.void
            : reportLeadFailure(error)
        ),
        Effect.withSpan("action.contact")
      );
      const exit = await runRequest(program, contactLayer(), waitUntil);
      if (Exit.isSuccess(exit)) {
        return { ok: true as const };
      }
      const error = Cause.findErrorOption(exit.cause);
      if (error._tag === "Some" && error.value._tag === "SchemaError") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Please check the highlighted fields.",
        });
      }
      if (error._tag === "Some" && error.value._tag === "TurnstileRejected") {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Please complete the verification and try again.",
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "We could not send your message. Please try again in a few minutes.",
      });
    },
  }),
};
