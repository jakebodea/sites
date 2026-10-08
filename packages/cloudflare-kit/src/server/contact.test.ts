import { describe, expect, it } from "@effect/vitest";
import {
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  Logger,
  Option,
  Ref,
  Schema,
} from "effect";

import {
  ContactForm,
  LeadMail,
  LeadMailFromConfig,
  leadNotificationText,
  submitContact,
} from "./contact.ts";
import { Email, EmailFailed } from "./email.ts";
import type { EmailMessage } from "./email.ts";
import { LeadNotSaved, LeadStore } from "./leads.ts";
import type { Lead } from "./leads.ts";
import {
  Turnstile,
  TurnstileAllowAll,
  TurnstileRejected,
  TurnstileUnavailable,
} from "./turnstile.ts";

const form = Schema.decodeUnknownSync(ContactForm)({
  email: " pat@example.com ",
  message: "We need a bid for a 40,000 sq ft tenant improvement.",
  name: "Pat Builder",
  turnstileToken: "token",
});

const request = {
  remoteIp: "203.0.113.9",
  requestId: "ray-1",
  sourcePath: "/contact",
};

/** In-memory test doubles; each returns the layer and a ref recording what it saw. */
const recorder = Effect.gen(function* recorder() {
  const leads = yield* Ref.make<Lead[]>([]);
  const emails = yield* Ref.make<EmailMessage[]>([]);
  const attempts = yield* Ref.make<EmailMessage[]>([]);
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
          Ref.update(attempts, (all) => [...all, message]).pipe(
            Effect.andThen(
              options.emailFails === true
                ? Effect.fail(new EmailFailed({ cause: "smtp down" }))
                : Ref.update(emails, (all) => [...all, message])
            )
          ),
      }),
      Layer.succeed(LeadMail, {
        alert: Option.some("alerts@example.com"),
        from: Option.some({ email: "site@example.com", name: "Website" }),
        inbox:
          options.inbox === false
            ? Option.none()
            : Option.some("office@example.com"),
        name: "Access Electric website",
        siteOrigin: "https://accesselectricinc.com",
      })
    );
  return { attempts, emails, layer, leads };
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
    const text = leadNotificationText({ ...form, sourcePath: "/contact" });
    expect(text).toContain("Page: /contact");
    expect(text).not.toContain("Referred by");
  });
});

describe(submitContact, () => {
  it.effect("saves the lead and notifies the inbox", () =>
    Effect.gen(function* savesNotifiesCaptures() {
      const { emails, layer, leads } = yield* recorder;
      const result = yield* submitContact(form, request).pipe(
        Effect.provide(Layer.merge(layer(), TurnstileAllowAll))
      );
      expect(result).toStrictEqual({ leadId: "lead-1" });
      expect((yield* Ref.get(leads))[0]?.sourcePath).toBe("/contact");
      expect((yield* Ref.get(emails))[0]?.replyTo).toBe("pat@example.com");
      expect((yield* Ref.get(emails))[0]?.subject).toBe(
        "New enquiry from Pat Builder"
      );
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
      const { emails, layer, leads } = yield* recorder;
      const rejectAll = Layer.succeed(Turnstile, {
        verify: () => Effect.fail(new TurnstileRejected({ codes: ["bad"] })),
      });
      const error = yield* submitContact(form, request).pipe(
        Effect.provide(Layer.merge(layer(), rejectAll)),
        Effect.flip
      );
      expect(error._tag).toBe("TurnstileRejected");
      expect(yield* Ref.get(leads)).toHaveLength(0);
      expect(yield* Ref.get(emails)).toHaveLength(0);
    })
  );

  it.effect("still succeeds when the notification email fails", () =>
    Effect.gen(function* survivesEmailFailure() {
      const { attempts, emails, layer } = yield* recorder;
      const logs: unknown[] = [];
      const logger = Logger.layer([
        Logger.make((entry) => {
          logs.push(entry.message);
        }),
      ]);
      const result = yield* submitContact(form, request).pipe(
        Effect.provide(
          Layer.mergeAll(layer({ emailFails: true }), TurnstileAllowAll, logger)
        )
      );
      expect(result.leadId).toBe("lead-1");
      expect(yield* Ref.get(emails)).toHaveLength(0);
      expect(
        (yield* Ref.get(attempts)).map((message) => message.to)
      ).toStrictEqual(["office@example.com"]);
      expect(logs.flat()).toContain("lead notification failed");
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

describe("contact alert policy", () => {
  it.effect(
    "alerts with lead details and requestId when Turnstile is unavailable",
    () =>
      Effect.gen(function* unavailableAlert() {
        const { emails, layer, leads } = yield* recorder;
        const unavailable = Layer.succeed(Turnstile, {
          verify: () =>
            Effect.fail(new TurnstileUnavailable({ cause: "offline" })),
        });
        const error = yield* submitContact(form, request).pipe(
          Effect.provide(Layer.merge(layer(), unavailable)),
          Effect.flip
        );
        expect(error._tag).toBe("TurnstileUnavailable");
        expect(yield* Ref.get(leads)).toHaveLength(0);
        const sent = yield* Ref.get(emails);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
          subject: "Lead submission failed: Access Electric website [ray-1]",
          text: "Site: https://accesselectricinc.com\nRequest: ray-1\nStep: verify\nError: TurnstileUnavailable\n\nName: Pat Builder\nEmail: pat@example.com\nPhone: -\nCompany: -\nPage: /contact\n\nWe need a bid for a 40,000 sq ft tenant improvement.",
          to: "alerts@example.com",
        });
        expect(sent[0]?.text).toContain("pat@example.com");
      })
  );

  it.effect("alerts with recoverable lead details when saving fails", () =>
    Effect.gen(function* saveAlert() {
      const { emails, layer } = yield* recorder;
      const failingStore = Layer.succeed(LeadStore, {
        save: () => Effect.fail(new LeadNotSaved({ cause: "database down" })),
      });
      const error = yield* submitContact(form, request).pipe(
        Effect.provide(
          Layer.mergeAll(layer(), failingStore, TurnstileAllowAll)
        ),
        Effect.flip
      );
      expect(error._tag).toBe("LeadNotSaved");
      const sent = yield* Ref.get(emails);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.text).toContain("Request: ray-1");
      expect(sent[0]?.text).toContain(form.message);
      expect(sent[0]?.text).toContain("Step: save");
    })
  );

  it.effect("alerts on a store defect and preserves the defect", () =>
    Effect.gen(function* defectAlert() {
      const { emails, layer } = yield* recorder;
      const failingStore = Layer.succeed(LeadStore, {
        save: () => Effect.die("unexpected"),
      });
      const exit = yield* submitContact(form, request).pipe(
        Effect.provide(
          Layer.mergeAll(layer(), failingStore, TurnstileAllowAll)
        ),
        Effect.exit
      );
      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(yield* Ref.get(emails)).toHaveLength(1);
    })
  );
});

describe("lead mail configuration", () => {
  it.effect("reads the site identity when sending is disabled", () =>
    Effect.gen(function* readsSiteIdentity() {
      const mail = yield* LeadMail;
      expect(mail).toStrictEqual({
        alert: Option.some("alerts@jbolabs.com"),
        from: Option.none(),
        inbox: Option.some("hello@jbolabs.com"),
        name: "JBO Labs website",
        siteOrigin: "https://jbolabs.com",
      });
    }).pipe(
      Effect.provide(
        LeadMailFromConfig.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                ALERT_EMAIL: "alerts@jbolabs.com",
                LEAD_NOTIFY_FROM: "",
                LEAD_NOTIFY_FROM_NAME: "JBO Labs website",
                LEAD_NOTIFY_TO: "hello@jbolabs.com",
                SITE_ORIGIN: "https://jbolabs.com",
              })
            )
          )
        )
      )
    )
  );
});
