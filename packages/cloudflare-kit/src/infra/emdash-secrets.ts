import * as Output from "alchemy/Output";
import { Random } from "alchemy/Random";
import { Effect, Redacted } from "effect";

import type { EmDashSecretsEnv } from "../env.ts";

export const encodeEmDashEncryptionKey = (hex: string): string => {
  const bytes = Uint8Array.from(hex.match(/.{2}/gu) ?? [], (byte) =>
    Number.parseInt(byte, 16)
  );
  return `emdash_enc_v1_${btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")}`;
};

export const emdashSecrets = Effect.gen(function* createEmDashSecrets() {
  const key = yield* Random("EmDashEncryptionKey", { bytes: 32 });
  return {
    EMDASH_ENCRYPTION_KEY: key.text.pipe(
      Output.map((value) =>
        Redacted.make(encodeEmDashEncryptionKey(Redacted.value(value)))
      )
    ),
  } satisfies Record<keyof EmDashSecretsEnv, Output.Output<Redacted.Redacted>>;
});
