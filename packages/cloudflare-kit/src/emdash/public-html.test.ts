import { describe, expect, it, vi } from "vitest";

import { fetchPublicHtml, publicHtmlRequest } from "./public-html.ts";

const env = {
  CF_VERSION_METADATA: { id: "version-1" },
  PUBLIC_HTML_CACHE_TTL_SECONDS: "30",
  SITE_ORIGIN: "https://example.com",
  STAGE: "prod",
};
const html = (text: string, headers: Readonly<Record<string, string>> = {}) =>
  new Response(text, {
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
const request = (path: string, options: RequestInit = {}) =>
  new Request(`${env.SITE_ORIGIN}${path}`, options);

describe(publicHtmlRequest, () => {
  it.each([
    "/",
    "/about",
    "/about/",
    "/portfolio",
    "/portfolio/commercial",
    "/projects/first-project",
  ])("accepts anonymous published HTML route %s", (path) => {
    expect(publicHtmlRequest(request(path), env)).toBeTruthy();
  });

  it.each([
    "/_emdash/admin",
    "/_emdash/api/media/file/test",
    "/_image",
    "/_actions/contact",
    "/_content/published",
    "/admin",
    "/auth",
    "/login",
    "/preview",
    "/contact",
    "/favicon.png",
    "/404",
    "/about?preview=1",
    "/about?utm_source=test",
    "/nested/arbitrary/path",
  ])("bypasses %s", (path) => {
    expect(publicHtmlRequest(request(path), env)).toBeFalsy();
  });

  it.each([
    "cookie",
    "authorization",
    "range",
    "upgrade",
    "x-astro-action",
    "x-emdash-preview",
    "x-emdash-request",
    "cache-control",
    "pragma",
    "if-none-match",
    "if-modified-since",
  ])("bypasses requests carrying %s", (name) => {
    expect(
      publicHtmlRequest(request("/", { headers: { [name]: "" } }), env)
    ).toBeFalsy();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD"])(
    "bypasses %s",
    (method) => {
      expect(publicHtmlRequest(request("/", { method }), env)).toBeFalsy();
    }
  );

  it("bypasses all nonprod stages, disabled or invalid TTLs, other hosts, and reload directives", () => {
    for (const STAGE of ["dev-test", "pr-2", "preview"]) {
      expect(publicHtmlRequest(request("/"), { ...env, STAGE })).toBeFalsy();
    }
    for (const PUBLIC_HTML_CACHE_TTL_SECONDS of [
      "",
      "0",
      "-1",
      "31",
      "NaN",
      "0.5",
    ]) {
      expect(
        publicHtmlRequest(request("/"), {
          ...env,
          PUBLIC_HTML_CACHE_TTL_SECONDS,
        })
      ).toBeFalsy();
    }
    expect(
      publicHtmlRequest(new Request("https://other.example/"), env)
    ).toBeFalsy();
    expect(
      publicHtmlRequest(
        request("/", { headers: { "cache-control": "no-cache" } }),
        env
      )
    ).toBeFalsy();
    expect(
      publicHtmlRequest(request("/", { headers: { pragma: "no-cache" } }), env)
    ).toBeFalsy();
  });
});

const fixture = () => {
  const values = new Map<string, Response>();
  const pending: Promise<void>[] = [];
  const cache = {
    match: vi.fn<(key: RequestInfo) => Promise<Response | undefined>>(
      async (key) =>
        await Promise.resolve(values.get(new Request(key).url)?.clone())
    ),
    put: vi.fn<(key: RequestInfo, response: Response) => Promise<void>>(
      async (key, response) => {
        values.set(new Request(key).url, response);
        await Promise.resolve();
      }
    ),
  };
  const ctx = {
    waitUntil: (promise: Promise<void>) => {
      pending.push(promise);
    },
  };
  return { cache, ctx, pending, values };
};

describe(fetchPublicHtml, () => {
  it("renders once then serves the shared copy without giving browsers a freshness window", async () => {
    const { cache, ctx, pending, values } = fixture();
    const render = vi.fn<() => Promise<Response>>(
      async () => await Promise.resolve(html("published"))
    );
    const first = await fetchPublicHtml(request("/"), env, ctx, render, cache);
    expect(Object.fromEntries(first.headers)).toMatchObject({
      "cache-control": "no-store",
      "x-public-html-cache": "MISS",
    });
    await Promise.all(pending);
    expect(
      values
        .get(`${env.SITE_ORIGIN}/?__cms_version=version-1`)
        ?.headers.get("cache-control")
    ).toBe("public, max-age=30");
    const second = await fetchPublicHtml(request("/"), env, ctx, render, cache);
    expect(Object.fromEntries(second.headers)).toMatchObject({
      "cache-control": "no-store",
      "x-public-html-cache": "HIT",
    });
    await expect(second.text()).resolves.toBe("published");
    expect(render).toHaveBeenCalledOnce();
  });

  it("starts cold when the deployed Worker version changes", async () => {
    const { cache, ctx, pending } = fixture();
    await fetchPublicHtml(
      request("/"),
      env,
      ctx,
      async () => await Promise.resolve(html("old asset build")),
      cache
    );
    await Promise.all(pending);
    const current = await fetchPublicHtml(
      request("/"),
      { ...env, CF_VERSION_METADATA: { id: "version-2" } },
      ctx,
      async () => await Promise.resolve(html("new asset build")),
      cache
    );
    expect(current.headers.get("x-public-html-cache")).toBe("MISS");
    await expect(current.text()).resolves.toBe("new asset build");
    expect(
      publicHtmlRequest(request("/"), {
        ...env,
        CF_VERSION_METADATA: { id: "" },
      })
    ).toBeFalsy();
  });

  it.each(["max-age=0", "max-age = 0", 'max-age="0"'])(
    "bypasses a primed shared entry for reload directive %s",
    async (directive) => {
      const { cache, ctx, pending } = fixture();
      await fetchPublicHtml(
        request("/"),
        env,
        ctx,
        async () => await Promise.resolve(html("cached")),
        cache
      );
      await Promise.all(pending);
      cache.match.mockClear();
      const response = await fetchPublicHtml(
        request("/", { headers: { "cache-control": directive } }),
        env,
        ctx,
        async () => await Promise.resolve(html("fresh")),
        cache
      );
      expect(cache.match).not.toHaveBeenCalled();
      await expect(response.text()).resolves.toBe("fresh");
    }
  );

  it("never reads an existing anonymous cache entry for editors or contact submissions", async () => {
    const { cache, ctx } = fixture();
    const render = vi.fn<() => Promise<Response>>(
      async () => await Promise.resolve(html("private"))
    );
    const response = await fetchPublicHtml(
      request("/", { headers: { cookie: "session=editor" } }),
      env,
      ctx,
      render,
      cache
    );
    await expect(response.text()).resolves.toBe("private");
    await fetchPublicHtml(
      request("/contact", { method: "POST" }),
      env,
      ctx,
      render,
      cache
    );
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each([
    html("private", { "set-cookie": "session=editor" }),
    html("private", { "cache-control": "private" }),
    html("private", { "cache-control": "public, no-store" }),
    html("private", { "cloudflare-cdn-cache-control": "no-store" }),
    html("private", { "cdn-cache-control": "no-store" }),
    html("varies", { vary: "accept-language" }),
    new Response("missing", {
      headers: { "content-type": "text/html" },
      status: 404,
    }),
    new Response("{}", { headers: { "content-type": "application/json" } }),
  ])(
    "does not store private, negotiated, error, or non-HTML responses %#",
    async (response) => {
      const { cache, ctx } = fixture();
      await fetchPublicHtml(
        request("/"),
        env,
        ctx,
        async () => await Promise.resolve(response),
        cache
      );
      expect(cache.put).not.toHaveBeenCalled();
    }
  );

  it("keeps serving uncached HTML when the cache is unavailable", async () => {
    const { ctx, pending } = fixture();
    const cache = {
      match: vi
        .fn<(key: RequestInfo) => Promise<Response | undefined>>()
        .mockRejectedValue(new Error("unavailable")),
      put: vi
        .fn<(key: RequestInfo, response: Response) => Promise<void>>()
        .mockRejectedValue(new Error("unavailable")),
    };
    const response = await fetchPublicHtml(
      request("/"),
      env,
      ctx,
      async () => await Promise.resolve(html("available")),
      cache
    );
    await expect(response.text()).resolves.toBe("available");
    await expect(Promise.all(pending)).resolves.toStrictEqual([undefined]);
  });
});
