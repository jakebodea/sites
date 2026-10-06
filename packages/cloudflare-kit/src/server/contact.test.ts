import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Option, Ref, Schema } from "effect";

import { Analytics } from "./analytics.ts";
import type { ServerEventCapture } from "./analytics.ts";
import {
  ContactForm,
  LeadInbox,
  leadNotificationText,
  reportLeadFailure,
  submitContact,
} from "./contact.ts";
import { Email, EmailFailed } from "./email.ts";
import type { EmailMessage } from "./email.ts";
import { LeadStore } from "./leads.ts";
import type { Lead } from "./leads.ts";
import {
  Turnstile,
  TurnstileAllowAll,
  TurnstileRejected,
} from "./turnstile.ts";

const form = Schema.decodeUnknownSync(ContactForm)({
  email: " pat@example.com ",
  message: "We need a bid for a 40,000 sq ft tenant improvement.",
  name: "Pat Builder",
  turnstileToken: "token",
});

const request = {
  distinctId: "visitor-1",
  remoteIp: "203.0.113.9",
  sessionId: "session-1",
  sourcePath: "/contact",
};

/** In-memory test doubles; each returns the layer and a ref recording what it saw. */
const recorder = Effect.gen(function* recorder() {
  const leads = yield* Ref.make<Lead[]>([]);
  const emails = yield* Ref.make<EmailMessage[]>([]);
  const events = yield* Ref.make<ServerEventCapture[]>([]);
  const layer = (options: { emailFails?: boolean; inbox?: boolean } = {}) =>
    Layer.mergeAll(
      Layer.succeed(LeadStore, {
        save: (lead) =>
          Ref.update(leads, (all) => [...all, lead]).pipe(
            Effect.as({ id: "lead-1" })
          ),
      }),
      Layer.succeed(Email, {
        send: (message) =>
          options.emailFails === true
            ? Effect.fail(new EmailFailed({ cause: "smtp down" }))
            : Ref.update(emails, (all) => [...all, message]),
      }),
      Layer.succeed(
        LeadInbox,
        options.inbox === false
          ? Option.none()
          : Option.some({
              from: { email: "site@example.com", name: "Website" },
              to: "office@example.com",
            })
      ),
      Layer.succeed(Analytics, {
        capture: (event) => Ref.update(events, (all) => [...all, event]),
      })
    );
  return { emails, events, layer, leads };
});

describe(ContactForm, () => {
  it("trims input and rejects malformed email", () => {
    expect(form.email).toBe("pat@example.com");
    const bad = Schema.decodeUnknownExit(ContactForm)({
      ...form,
      email: "nope",
    });
    expect(Exit.isFailure(bad)).toBeTruthy();
  });

  it("caps the number of intake answers", () => {
    const answer = { answer: "Under $5k", question: "Budget" };
    const tooMany = Schema.decodeUnknownExit(ContactForm)({
      ...form,
      answers: Array.from({ length: 9 }, () => answer),
    });
    expect(Exit.isFailure(tooMany)).toBeTruthy();
  });
});

describe(leadNotificationText, () => {
  it("includes the referrer and intake answers when given", () => {
    const text = leadNotificationText({
      ...form,
      answers: [{ answer: "1-3 months", question: "Timeline" }],
      referrer: "Alex Rivera",
      sourcePath: "/contact",
    });
    expect(text).toContain("Referred by: Alex Rivera");
    expect(text).toContain("Timeline: 1-3 months");
  });

  it("leaves the referrer line out when there is none", () => {
    expect(
      leadNotificationText({ ...form, sourcePath: "/contact" })
    ).not.toContain("Referred by");
  });
});

describe(submitContact, () => {
  it.effect("saves the lead, notifies the inbox, and captures the event", () =>
    Effect.gen(function* savesNotifiesCaptures() {
      const { emails, events, layer, leads } = yield* recorder;
      const result = yield* submitContact(form, request).pipe(
        Effect.provide(Layer.merge(layer(), TurnstileAllowAll))
      );
      expect(result).toStrictEqual({ leadId: "lead-1" });
      expect((yield* Ref.get(leads))[0]?.sourcePath).toBe("/contact");
      expect((yield* Ref.get(emails))[0]?.replyTo).toBe("pat@example.com");
      expect((yield* Ref.get(emails))[0]?.subject).toBe(
        "New enquiry from Pat Builder"
      );
      expect((yield* Ref.get(events))[0]).toMatchObject({
        distinctId: "visitor-1",
        event: "lead submitted",
      });
    })
  );

  it.effect("names the referrer in the notification subject", () =>
    Effect.gen(function* namesReferrer() {
      const { emails, layer, leads } = yield* recorder;
      yield* submitContact({ ...form, referrer: "Alex Rivera" }, request).pipe(
        Effect.provide(Layer.merge(layer(), TurnstileAllowAll))
      );
      expect((yield* Ref.get(leads))[0]?.referrer).toBe("Alex Rivera");
      expect((yield* Ref.get(emails))[0]?.subject).toBe(
        "New enquiry from Pat Builder (via Alex Rivera)"
      );
    })
  );

  it.effect("stops before saving when Turnstile rejects the visitor", () =>
    Effect.gen(function* stopsOnTurnstileRejection() {
      const { layer, leads } = yield* recorder;
      const rejectAll = Layer.succeed(Turnstile, {
        verify: () => Effect.fail(new TurnstileRejected({ codes: ["bad"] })),
      });
      const error = yield* submitContact(form, request).pipe(
        Effect.provide(Layer.merge(layer(), rejectAll)),
        Effect.flip
      );
      expect(error._tag).toBe("TurnstileRejected");
      expect(yield* Ref.get(leads)).toHaveLength(0);
    })
  );

  it.effect("still succeeds when the notification email fails", () =>
    Effect.gen(function* survivesEmailFailure() {
      const { events, layer } = yield* recorder;
      const result = yield* submitContact(form, request).pipe(
        Effect.provide(
          Layer.merge(layer({ emailFails: true }), TurnstileAllowAll)
        )
      );
      expect(result.leadId).toBe("lead-1");
      expect(yield* Ref.get(events)).toHaveLength(1);
    })
  );

  it.effect("skips email when no inbox is configured", () =>
    Effect.gen(function* skipsEmailWithoutInbox() {
      const { emails, layer } = yield* recorder;
      yield* submitContact(form, request).pipe(
        Effect.provide(Layer.merge(layer({ inbox: false }), TurnstileAllowAll))
      );
      expect(yield* Ref.get(emails)).toHaveLength(0);
    })
  );
});

describe(reportLeadFailure, () => {
  it.effect("captures the failure for the PostHog alert", () =>
    Effect.gen(function* captureFailure() {
      const { events, layer } = yield* recorder;
      yield* reportLeadFailure({ _tag: "LeadNotSaved" }).pipe(
        Effect.provide(layer())
      );
      expect(yield* Ref.get(events)).toStrictEqual([
        { event: "lead submit failed", properties: { error: "LeadNotSaved" } },
      ]);
    })
  );
});
