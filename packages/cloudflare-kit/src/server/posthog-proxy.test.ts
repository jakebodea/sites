import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPostHogProxyRequest,
  postHogAssetHost,
  proxyPostHog,
} from "./posthog-proxy.ts";

const config = { host: "https://us.i.posthog.com", path: "/a1b2c3" };

describe(isPostHogProxyRequest, () => {
  it("matches only the configured prefix", () => {
    expect(
      isPostHogProxyRequest(new URL("https://x.dev/a1b2c3/e/"), config)
    ).toBeTruthy();
    expect(
      isPostHogProxyRequest(new URL("https://x.dev/a1b2c3x"), config)
    ).toBeFalsy();
    expect(
      isPostHogProxyRequest(new URL("https://x.dev/about"), config)
    ).toBeFalsy();
  });

  it("is off when no path is configured", () => {
    expect(
      isPostHogProxyRequest(new URL("https://x.dev/"), { ...config, path: "" })
    ).toBeFalsy();
  });
});

describe(proxyPostHog, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards ingestion without cookies and with the client IP", async () => {
    const upstream = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", upstream);
    await proxyPostHog(
      new Request("https://x.dev/a1b2c3/e/?v=1", {
        body: "{}",
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          cookie: "session=secret",
        },
        method: "POST",
      }),
      config
    );
    const [target, init] = upstream.mock.calls[0] ?? [];
    expect(target).toBe("https://us.i.posthog.com/e/?v=1");
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("serves static assets from the assets host", () => {
    expect(postHogAssetHost("https://eu.i.posthog.com")).toBe(
      "https://eu-assets.i.posthog.com"
    );
  });
});
