/**
 * Cloudflare Turnstile verification. The secret is read once, at layer
 * construction, as a `Redacted` value so it never reaches logs or traces.
 */
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export { TURNSTILE_TEST_KEYS } from "../infra/turnstile.ts";

/** The visitor failed the challenge (or sent no token). */
export class TurnstileRejected extends Schema.TaggedError<TurnstileRejected>()(
  "TurnstileRejected",
  { codes: Schema.Array(Schema.String) }
) {}

/** Turnstile could not be reached or answered with something unexpected. */
export class TurnstileUnavailable extends Schema.TaggedError<TurnstileUnavailable>()(
  "TurnstileUnavailable",
  { cause: Schema.Defect() }
) {}

const SiteverifyResponse = Schema.Struct({
  "error-codes": Schema.optional(Schema.Array(Schema.String)),
  success: Schema.Boolean,
});

export interface TurnstileVerification {
  readonly token: string;
  /** The visitor's IP (`CF-Connecting-IP`), which strengthens the check. */
  readonly remoteIp: string | undefined;
}

export class Turnstile extends Context.Service<
  Turnstile,
  {
    readonly verify: (
      input: TurnstileVerification
    ) => Effect.Effect<void, TurnstileRejected | TurnstileUnavailable>;
  }
>()("@jakebodea/cloudflare-kit/Turnstile") {}

/** Verifies tokens against Cloudflare. Needs `TURNSTILE_SECRET_KEY` and an `HttpClient`. */
export const TurnstileLive = Layer.effect(
  Turnstile,
  Effect.gen(function* TurnstileLive() {
    const secret = yield* Config.Redacted("TURNSTILE_SECRET_KEY");
    const client = yield* HttpClient.HttpClient;

    const verify = Effect.fn("Turnstile.verify")(function* verify({
      remoteIp,
      token,
    }: TurnstileVerification) {
      if (token === "") {
        return yield* new TurnstileRejected({
          codes: ["missing-input-response"],
        });
      }
      const params = new URLSearchParams({
        response: token,
        secret: Redacted.value(secret),
      });
      if (remoteIp !== undefined) {
        params.set("remoteip", remoteIp);
      }
      const request = HttpClientRequest.post(SITEVERIFY_URL).pipe(
        HttpClientRequest.bodyUrlParams(params)
      );
      const result = yield* client.execute(request).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknownEffect(SiteverifyResponse)),
        Effect.mapError((cause) => new TurnstileUnavailable({ cause }))
      );
      if (!result.success) {
        return yield* new TurnstileRejected({
          codes: result["error-codes"] ?? [],
        });
      }
      return yield* Effect.void;
    });

    return { verify };
  })
);

/** Accepts every token; for tests. */
export const TurnstileAllowAll = Layer.succeed(Turnstile, {
  verify: () => Effect.void,
});
