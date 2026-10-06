/**
 * What browser analytics may send. Marketing sites run PostHog cookieless
 * (in-memory persistence, no consent banner), so the data must stay anonymous:
 * only allowlisted events and properties leave the browser, URLs are reduced
 * to known public routes, and query strings keep only UTM attribution.
 */
import type { CaptureResult } from "posthog-js";

/** The only events the browser sends. */
export const analyticsEvents = [
  "$pageview",
  "$pageleave",
  "cta clicked",
  "contact form started",
  "contact form submitted",
  "contact form failed",
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];
/** Custom events a site may capture explicitly (the SDK sends `$pageview`/`$pageleave` itself). */
export type CustomAnalyticsEvent = Exclude<AnalyticsEvent, `$${string}`>;

const EVENTS = new Set<string>(analyticsEvents);

/** Scalar properties that leave the browser unchanged. */
const SAFE_PROPERTIES = new Set([
  "token",
  "distinct_id",
  "$device_id",
  "$session_id",
  "$window_id",
  "$pageview_id",
  "$lib",
  "$lib_version",
  "$insert_id",
  "$time",
  "$sent_at",
  "$process_person_profile",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$referring_domain",
  "$host",
  "$prev_pageview_duration",
  "$prev_pageview_max_scroll_percentage",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "cta_location",
  "form_error",
]);
const URL_PROPERTIES = new Set([
  "$current_url",
  "$referrer",
  "$prev_pageview_url",
]);
const PATH_PROPERTIES = new Set(["$pathname", "$prev_pageview_pathname"]);
const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/** Public route shapes; anything else (404s, typos, probes) collapses to `/other`. */
const PUBLIC_ROUTES = [
  /^\/$/u,
  /^\/(?:about|contact|portfolio|privacy)$/u,
  /^\/portfolio\/[a-z0-9-]+$/u,
  /^\/projects\/[a-z0-9-]+$/u,
];

const trimTrailingSlashes = (pathname: string): string => {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === "/") {
    end -= 1;
  }
  return pathname.slice(0, end);
};

export const analyticsPath = (pathname: string): string => {
  const path = trimTrailingSlashes(pathname);
  return PUBLIC_ROUTES.some((route) => route.test(path)) ? path : "/other";
};

/** Same-site URLs keep the route and UTM params; other sites reduce to their origin. */
export const analyticsUrl = (value: string, siteHost: string): string => {
  if (!URL.canParse(value)) {
    return "";
  }
  const url = new URL(value);
  if (url.hostname !== siteHost) {
    return url.origin;
  }
  const kept = new URLSearchParams();
  for (const param of UTM_PARAMS) {
    const utm = url.searchParams.get(param);
    if (utm !== null) {
      kept.set(param, utm);
    }
  }
  const query = kept.size > 0 ? `?${kept.toString()}` : "";
  return `${url.origin}${analyticsPath(url.pathname)}${query}`;
};

type Scalar = string | number | boolean;

/** The only property shape that ever leaves the browser: allowlisted keys with scalar values. */
export type AnalyticsProperties = Record<string, Scalar>;

const isScalar = (value: unknown): value is Scalar =>
  ["string", "number", "boolean"].includes(typeof value);

export const sanitizeProperties = (
  properties: CaptureResult["properties"],
  siteHost: string
) =>
  Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]): [string, Scalar][] => {
      if (!isScalar(value)) {
        return [];
      }
      if (URL_PROPERTIES.has(key)) {
        return [[key, analyticsUrl(String(value), siteHost)]];
      }
      if (PATH_PROPERTIES.has(key)) {
        return [[key, analyticsPath(String(value))]];
      }
      return SAFE_PROPERTIES.has(key) ? [[key, value]] : [];
    })
  ) satisfies AnalyticsProperties;

/** `before_send`: drop unknown events, strip everything not explicitly allowed. */
export const prepareAnalyticsEvent = (
  event: CaptureResult | null,
  siteHost: string
): CaptureResult | null => {
  if (event === null || !EVENTS.has(event.event)) {
    return null;
  }
  return {
    event: event.event,
    properties: sanitizeProperties(event.properties, siteHost),
    timestamp: event.timestamp,
    uuid: event.uuid,
  };
};

/** Browser config the server renders into the page; `enabled` is false outside prod. */
export interface BrowserAnalyticsConfig {
  readonly enabled: boolean;
  readonly projectKey: string;
  /** Same-origin reverse proxy path for ingestion, e.g. `/3f9c0a1b2c4d`. */
  readonly proxyPath: string;
  /** PostHog app host for toolbar links, e.g. `https://us.posthog.com`. */
  readonly uiHost: string;
  /** The production hostname; capture never runs anywhere else. */
  readonly siteHost: string;
}

export const canInitializeAnalytics = (
  config: BrowserAnalyticsConfig,
  hostname: string
): boolean =>
  config.enabled &&
  config.projectKey !== "" &&
  config.proxyPath !== "" &&
  hostname === config.siteHost;
