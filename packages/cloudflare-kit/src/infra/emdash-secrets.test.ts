import { resolvePluginEncryptionKeys } from "emdash";
import { describe, expect, it } from "vitest";

import { encodeEmDashEncryptionKey } from "./emdash-secrets.ts";

const BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

describe(encodeEmDashEncryptionKey, () => {
  it("encodes 32 random bytes as canonical base64url with the EmDash prefix", async () => {
    const hex = "0123456789abcdef".repeat(4);
    const encoded = encodeEmDashEncryptionKey(hex);
    expect(encoded.startsWith("emdash_enc_v1_")).toBeTruthy();
    const payload = encoded.slice("emdash_enc_v1_".length);
    expect(payload).toMatch(BASE64URL);
    expect(
      Array.from(
        atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
        (byte) => (byte.codePointAt(0) ?? 0).toString(16).padStart(2, "0")
      ).join("")
    ).toBe(hex);
    expect(
      btoa(atob(payload.replaceAll("-", "+").replaceAll("_", "/")))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "")
    ).toBe(payload);
    await expect(
      resolvePluginEncryptionKeys({ EMDASH_ENCRYPTION_KEY: encoded })
    ).resolves.toHaveLength(1);
  });
});
