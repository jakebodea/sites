/**
 * Same-origin reverse proxy for posthog-js, mounted at a random per-stage path
 * (`POSTHOG_PROXY_PATH`) so blocklists cannot match it. Runs in the Worker
 * entry before Astro, so proxied hits skip rendering, sessions, and the CMS.
 *
 * Request logs from this route are excluded from the PostHog log export (see
 * `siteAnalytics` in `@jakebodea/cloudflare-kit/infra`).
 */

export interface PostHogProxyConfig {
  /** Path prefix, e.g. `/3f9c0a1b2c4d`. Empty disables the proxy. */
  readonly path: string;
  /** Ingestion host, e.g. `https://us.i.posthog.com`. */
  readonly host: string;
}

/** `https://us.i.posthog.com` -> `https://us-assets.i.posthog.com` (where posthog-js loads extensions). */
export const postHogAssetHost = (host: string): string =>
  host.replace(
    /^https:\/\/(?<region>us|eu)\.i\.posthog\.com$/u,
    "https://$<region>-assets.i.posthog.com"
  );

/** Whether `request` targets the proxy; cheap enough to run on every request. */
export const isPostHogProxyRequest = (
  url: URL,
  config: PostHogProxyConfig
): boolean =>
  config.path !== "" &&
  (url.pathname === config.path || url.pathname.startsWith(`${config.path}/`));

/** Headers that must not be forwarded upstream (cookies belong to this site). */
const DROPPED_REQUEST_HEADERS = ["cookie", "host"];

export const proxyPostHog = async (
  request: Request,
  config: PostHogProxyConfig
): Promise<Response> => {
  const url = new URL(request.url);
  const upstreamPath = url.pathname.slice(config.path.length) || "/";
  const upstreamHost = upstreamPath.startsWith("/static/")
    ? postHogAssetHost(config.host)
    : config.host;
  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST_HEADERS) {
    headers.delete(name);
  }
  // PostHog derives GeoIP from the client address; disable "Capture IP" in the project to drop it after lookup.
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp !== null) {
    headers.set("x-forwarded-for", clientIp);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return await fetch(`${upstreamHost}${upstreamPath}${url.search}`, {
    body: hasBody ? request.body : null,
    headers,
    method: request.method,
    redirect: "manual",
  });
};
