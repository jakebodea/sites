import { describe, expect, it } from "vitest";

import {
  accountMutationDenied,
  decodeOwnerConfig,
  earlyOwnershipGate,
} from "./owner-policy.ts";

const config = decodeOwnerConfig({
  CMS_BOOTSTRAP_TOKEN: "test-bootstrap-credential-at-least-32-bytes",
  CMS_OWNER_EMAIL: "owner@example.test",
  CMS_OWNER_SITE: "example",
  SITE_ORIGIN: "https://example.test",
  STAGE: "pr-42",
});
const request = (path: string, method = "POST", token?: string): Request => {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set("x-cms-bootstrap-token", token);
  }
  return new Request(`https://example.test${path}`, { headers, method });
};

describe("hosted CMS ownership", () => {
  it.each([
    "/_emdash/api/setup/admin",
    "/_emdash/api/setup/admin/verify",
    "/_emdash/api/setup/%61dmin/verify/",
    "/_emdash/api/setup/dev-bypass",
    "/_emdash/api/auth/dev-bypass",
    "/_emdash/api/auth/signup/request",
    "/_emdash/api/auth/oauth/google/callback",
  ])(
    "closes unverified account creation at %s even with the deploy token",
    (path) => {
      expect(
        earlyOwnershipGate(
          request(path, "POST", config.CMS_BOOTSTRAP_TOKEN),
          config
        )?.status
      ).toBe(403);
    }
  );

  it.each(["/_emdash/api/setup", "/_emdash/api/setup/owner"])(
    "requires a deploy credential for %s",
    (path) => {
      expect(earlyOwnershipGate(request(path), config)?.status).toBe(401);
      expect(
        earlyOwnershipGate(request(path, "POST", "wrong-token"), config)?.status
      ).toBe(401);
      expect(
        earlyOwnershipGate(
          request(path, "POST", config.CMS_BOOTSTRAP_TOKEN),
          config
        )
      ).toBeUndefined();
    }
  );

  it("leaves status, email login, and authenticated passkey registration to EmDash", () => {
    for (const path of [
      "/_emdash/api/setup/status",
      "/_emdash/api/auth/magic-link/send",
      "/_emdash/api/auth/passkey/register/options",
    ]) {
      const method = path.endsWith("/status") ? "GET" : "POST";
      expect(earlyOwnershipGate(request(path, method), config)).toBeUndefined();
    }
    expect(
      earlyOwnershipGate(request("/_emdash/api/setup/admin"), config)?.status
    ).toBe(403);
  });

  it("rejects missing owner configuration", () => {
    expect(() =>
      decodeOwnerConfig({ CMS_BOOTSTRAP_TOKEN: config.CMS_BOOTSTRAP_TOKEN })
    ).toThrow("CMS_OWNER_EMAIL");
  });

  it.each([
    {
      body: { role: 40 },
      method: "PUT",
      path: "/_emdash/api/admin/users/owner",
    },
    {
      body: { email: "stranger@example.test" },
      method: "PUT",
      path: "/_emdash/api/admin/users/owner",
    },
    { body: {}, method: "DELETE", path: "/_emdash/api/admin/users/owner" },
    {
      body: {},
      method: "POST",
      path: "/_emdash/api/admin/users/owner/disable",
    },
  ])(
    "protects the permanent owner from $method $path",
    ({ body, method, path }) => {
      expect(
        accountMutationDenied({
          body,
          ownerEmail: config.CMS_OWNER_EMAIL,
          request: request(path, method),
          targetEmail: config.CMS_OWNER_EMAIL,
        })?.status
      ).toBe(403);
    }
  );

  it("permits unchanged owner identity and prevents client promotion or email substitution", () => {
    const mutation = request("/_emdash/api/admin/users/client", "PUT");
    expect(
      accountMutationDenied({
        body: { email: config.CMS_OWNER_EMAIL, role: 50 },
        ownerEmail: config.CMS_OWNER_EMAIL,
        request: mutation,
        targetEmail: config.CMS_OWNER_EMAIL,
      })
    ).toBeUndefined();
    for (const body of [{ role: 50 }, { email: config.CMS_OWNER_EMAIL }]) {
      expect(
        accountMutationDenied({
          body,
          ownerEmail: config.CMS_OWNER_EMAIL,
          request: mutation,
          targetEmail: "client@example.test",
        })?.status
      ).toBe(403);
    }
    expect(
      accountMutationDenied({
        body: { role: 40 },
        ownerEmail: config.CMS_OWNER_EMAIL,
        request: mutation,
        targetEmail: "client@example.test",
      })
    ).toBeUndefined();
  });
});
