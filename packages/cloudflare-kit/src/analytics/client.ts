/**
 * Cookieless posthog-js for marketing sites. Loaded only when analytics is
 * enabled (prod, key configured, production hostname); the SDK itself is a
 * dynamic import so pages without analytics ship no PostHog code.
 */
import type { CaptureResult } from "posthog-js";
import type { PostHog } from "posthog-js/dist/module.slim.no-external";

import { canInitializeAnalytics, prepareAnalyticsEvent } from "./privacy.ts";
import type {
  BrowserAnalyticsConfig,
  CustomAnalyticsEvent,
} from "./privacy.ts";

const beforeSend =
  (siteHost: string) =>
  (event: CaptureResult | null): CaptureResult | null =>
    prepareAnalyticsEvent(event, siteHost);

let client: PostHog | undefined;

export const initializeAnalytics = async (
  config: BrowserAnalyticsConfig
): Promise<void> => {
  if (
    client !== undefined ||
    !canInitializeAnalytics(config, window.location.hostname)
  ) {
    return;
  }
  try {
    const { posthog } = await import("posthog-js/dist/module.slim.no-external");
    posthog.init(config.projectKey, {
      advanced_disable_flags: true,
      api_host: `${window.location.origin}${config.proxyPath}`,
      autocapture: false,
      before_send: beforeSend(config.siteHost),
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_pageleave: true,
      capture_pageview: true,
      capture_performance: false,
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      disable_surveys: true,
      // Cookieless: identifiers live in memory and reset on every page load. No consent banner needed.
      persistence: "memory",
      person_profiles: "identified_only",
      rageclick: false,
      respect_dnt: true,
      ui_host: config.uiHost,
    });
    client = posthog;
  } catch {
    // Analytics is best effort and must never break the page.
  }
};

export const captureAnalytics = (
  event: CustomAnalyticsEvent,
  properties: Readonly<Record<string, string | number | boolean>> = {}
): void => {
  try {
    client?.capture(event, { ...properties });
  } catch {
    // Delivery is best effort.
  }
};

/** Links a server-side event to this page view (what posthog-js `tracing_headers` would send). */
export interface AnalyticsIdentity {
  readonly distinctId?: string;
  readonly sessionId?: string;
}

export const analyticsIdentity = (): AnalyticsIdentity => {
  if (client === undefined) {
    return {};
  }
  try {
    const sessionId = client.get_session_id();
    return {
      distinctId: client.get_distinct_id(),
      sessionId: sessionId === "" ? undefined : sessionId,
    };
  } catch {
    return {};
  }
};
