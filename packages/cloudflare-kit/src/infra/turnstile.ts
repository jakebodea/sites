/**
 * Cloudflare's documented always-pass Turnstile test keys, used for local
 * development, the workerd smoke test, and CI. Deployed stages get a real
 * widget from `Cloudflare.Turnstile.Widget`.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = {
  secretKey: "1x0000000000000000000000000000000AA",
  siteKey: "1x00000000000000000000AA",
} as const;
