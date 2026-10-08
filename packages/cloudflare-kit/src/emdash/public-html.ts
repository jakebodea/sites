/**
 * A short per-data-center HTML cache avoids repeating CMS SSR/D1 work. The
 * pre-Worker `cache` feature stays disabled: enabling it bills static assets too.
 * CMS edits become visible to anonymous visitors within this bounded TTL.
 */
interface HtmlCacheEnv {
  readonly CF_VERSION_METADATA?: { readonly id: string };
  readonly STAGE: string;
  readonly SITE_ORIGIN: string;
  readonly PUBLIC_HTML_CACHE_TTL_SECONDS: string;
}

const MAX_TTL_SECONDS = 30;
const PUBLIC_PAGE =
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?|(?:projects|portfolio)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?)?$/u;
const RESERVED_PAGE =
  /^\/(?:admin|api|auth|actions|contact|login|logout|preview|404)(?:\/|$)/u;
const BYPASS_HEADERS = [
  "authorization",
  "cookie",
  "range",
  "upgrade",
  "x-astro-action",
  "x-emdash-preview",
  "x-emdash-request",
  "cache-control",
  "pragma",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "if-range",
];
const UNCACHEABLE = /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/iu;

const ttlSeconds = (env: HtmlCacheEnv): number => {
  const ttl = Number(env.PUBLIC_HTML_CACHE_TTL_SECONDS);
  if (
    env.STAGE !== "prod" ||
    !Number.isInteger(ttl) ||
    (env.CF_VERSION_METADATA?.id ?? "") === ""
  ) {
    return 0;
  }
  return ttl > 0 && ttl <= MAX_TTL_SECONDS ? ttl : 0;
};

/** Only the public HTML route shapes; CMS, media, actions, and arbitrary paths bypass. */
export const publicHtmlRequest = (
  request: Request,
  env: HtmlCacheEnv
): boolean => {
  const url = new URL(request.url);
  if (
    ttlSeconds(env) === 0 ||
    request.method !== "GET" ||
    url.origin !== env.SITE_ORIGIN
  ) {
    return false;
  }
  if (
    url.search !== "" ||
    !PUBLIC_PAGE.test(url.pathname) ||
    RESERVED_PAGE.test(url.pathname)
  ) {
    return false;
  }
  if (BYPASS_HEADERS.some((name) => request.headers.has(name))) {
    return false;
  }
  return true;
};

const cacheableHtml = (response: Response): boolean => {
  if (
    response.status !== 200 ||
    response.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
      "text/html"
  ) {
    return false;
  }
  if (response.headers.has("set-cookie") || response.headers.has("vary")) {
    return false;
  }
  return [
    "cache-control",
    "cdn-cache-control",
    "cloudflare-cdn-cache-control",
  ].every((name) => !UNCACHEABLE.test(response.headers.get(name) ?? ""));
};

const storeHtml = async (
  cache: Pick<Cache, "put">,
  key: Request,
  response: Response
): Promise<void> => {
  try {
    await cache.put(key, response);
  } catch {
    // A cache failure must not make the site unavailable.
  }
};

const visitorResponse = (
  response: Response,
  state: "HIT" | "MISS"
): Response => {
  const headers = new Headers(response.headers);
  // The shared copy's TTL is internal; browsers and upstream proxies revalidate.
  headers.set("Cache-Control", "no-store");
  headers.set("X-Public-HTML-Cache", state);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

export const fetchPublicHtml = async (
  request: Request,
  env: HtmlCacheEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  render: () => Promise<Response>,
  cache?: Pick<Cache, "match" | "put">
): Promise<Response> => {
  if (!publicHtmlRequest(request, env)) {
    return await render();
  }
  let storage: Pick<Cache, "match" | "put">;
  try {
    storage = cache ?? (await caches.open("cms-public-html-v1"));
  } catch {
    return await render();
  }
  // Strip every request header from the storage key. Eligibility was checked
  // before this; authenticated/editor requests can never read this shared copy.
  const keyUrl = new URL(request.url);
  // A deployment starts cold so cached HTML never refers to an older asset build.
  keyUrl.searchParams.set("__cms_version", env.CF_VERSION_METADATA?.id ?? "");
  const key = new Request(keyUrl);
  try {
    const hit = await storage.match(key);
    if (hit !== undefined) {
      return visitorResponse(hit, "HIT");
    }
  } catch {
    // A cache failure must not make the site unavailable.
  }
  const response = await render();
  if (!cacheableHtml(response)) {
    return response;
  }
  const stored = response.clone();
  const headers = new Headers(stored.headers);
  headers.set("Cache-Control", `public, max-age=${ttlSeconds(env)}`);
  ctx.waitUntil(
    storeHtml(storage, key, new Response(stored.body, { headers }))
  );
  return visitorResponse(response, "MISS");
};
