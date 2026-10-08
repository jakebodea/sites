import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { TURNSTILE_TEST_KEYS, Turnstile, TurnstileLive } from "./turnstile.ts";

/** A Turnstile layer whose siteverify call returns `body`; records the form it was sent. */
interface SiteverifyReply {
  readonly success: boolean;
  readonly "error-codes"?: readonly string[];
}

const turnstileReplying = (body: SiteverifyReply, sent: string[] = []) =>
  TurnstileLive.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => {
          if (request.body._tag === "Uint8Array") {
            sent.push(new TextDecoder().decode(request.body.body));
          }
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, Response.json(body))
          );
        })
      )
    ),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ TURNSTILE_SECRET_KEY: "test-secret" })
      )
    )
  );

const verifyToken = (token: string) =>
  Effect.gen(function* verifyWithLayer() {
    const turnstile = yield* Turnstile;
    yield* turnstile.verify({ remoteIp: "203.0.113.9", token });
  });

describe("Turnstile verification", () => {
  // oxlint-disable-next-line test-quality/require-subject-call -- pins Cloudflare's documented always-pass site key; a constant has no function to call
  it("documents Cloudflare's always-pass test keys", () => {
    expect(TURNSTILE_TEST_KEYS.siteKey).toMatch(/^1x0+AA$/u);
  });

  it.effect("accepts a token Cloudflare verifies", () =>
    Effect.gen(function* acceptsVerifiedToken() {
      const sent: string[] = [];
      yield* verifyToken("ok-token").pipe(
        Effect.provide(turnstileReplying({ success: true }, sent))
      );
      expect(sent[0]).toContain("test-secret");
      expect(sent[0]).toContain("203.0.113.9");
    })
  );

  it.effect("rejects a token Cloudflare refuses", () =>
    Effect.gen(function* rejectsRefusedToken() {
      const error = yield* verifyToken("bad-token").pipe(
        Effect.provide(
          turnstileReplying({
            "error-codes": ["invalid-input-response"],
            success: false,
          })
        ),
        Effect.flip
      );
      expect(error).toMatchObject({
        _tag: "TurnstileRejected",
        codes: ["invalid-input-response"],
      });
    })
  );

  it.effect("rejects an empty token without calling Cloudflare", () =>
    Effect.gen(function* rejectsEmptyToken() {
      const sent: string[] = [];
      const error = yield* verifyToken("").pipe(
        Effect.provide(turnstileReplying({ success: true }, sent)),
        Effect.flip
      );
      expect(error._tag).toBe("TurnstileRejected");
      expect(sent).toHaveLength(0);
    })
  );
});
