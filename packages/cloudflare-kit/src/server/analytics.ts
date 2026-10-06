import { Config, Context, Effect, Layer, Option } from "effect";
/**
 * Server-side product analytics (PostHog), disabled cleanly when no project
 * key is configured. Capture never fails or slows a request: events are sent
 * in `waitUntil` after the response, and delivery errors are only logged.
 */
import { PostHog } from "posthog-node";

import { WaitUntil } from "./runtime.ts";

/** The only events the server sends. */
export type ServerEvent = "lead submitted";

export interface ServerEventCapture {
  readonly event: ServerEvent;
  /** The browser's PostHog distinct id when known, so the event joins the visitor's session. */
  readonly distinctId?: string;
  readonly sessionId?: string;
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
}

export class Analytics extends Context.Service<
  Analytics,
  { readonly capture: (event: ServerEventCapture) => Effect.Effect<void> }
>()("@jakebodea/cloudflare-kit/Analytics") {}

export const AnalyticsDisabled = Layer.succeed(Analytics, {
  capture: () => Effect.void,
});

type Scalar = string | number | boolean;

/** PostHog event properties as sent by the server: scalars only. */
type ServerEventProperties = Record<string, Scalar>;

const toPostHogMessage = (
  { distinctId, event, properties, sessionId }: ServerEventCapture,
  fallbackId: string
) => {
  const payload = Object.fromEntries([
    ...Object.entries(properties ?? {}),
    // Anonymous server events must not create person profiles.
    ["$process_person_profile", distinctId !== undefined],
    ...(sessionId === undefined ? [] : [["$session_id", sessionId] as const]),
  ]) satisfies ServerEventProperties;
  return { distinctId: distinctId ?? fallbackId, event, properties: payload };
};

/** Exported for tests: builds the PostHog payload for a capture. */
export const postHogMessage = toPostHogMessage;

/**
 * PostHog via posthog-node, tuned for Workers: no batching (`flushAt: 1`,
 * `flushInterval: 0`) and `captureImmediate` handed to `waitUntil`.
 */
export const AnalyticsPostHog = Layer.unwrap(
  Effect.gen(function* AnalyticsPostHog() {
    const key = yield* Config.String("POSTHOG_PROJECT_KEY").pipe(
      Config.option,
      Effect.map(Option.filter((value) => value !== ""))
    );
    if (Option.isNone(key)) {
      return AnalyticsDisabled;
    }
    const host = yield* Config.String("POSTHOG_HOST");
    const waitUntil = yield* WaitUntil;
    const client = new PostHog(key.value, {
      flushAt: 1,
      flushInterval: 0,
      host,
    });
    return Layer.succeed(Analytics, {
      capture: (capture) =>
        Effect.gen(function* captureEvent() {
          const message = toPostHogMessage(capture, crypto.randomUUID());
          const delivery = Effect.tryPromise(async () => {
            await client.captureImmediate(message);
          }).pipe(
            Effect.tapError((error) =>
              Effect.logWarning("analytics delivery failed", error)
            ),
            Effect.ignore
          );
          waitUntil(Effect.runPromise(delivery));
          yield* Effect.logDebug("analytics event queued").pipe(
            Effect.annotateLogs({ event: capture.event })
          );
        }),
    });
  })
);
