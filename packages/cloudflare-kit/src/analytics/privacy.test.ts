import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";

import {
  analyticsPath,
  analyticsUrl,
  canInitializeAnalytics,
  prepareAnalyticsEvent,
} from "./privacy.ts";

const host = "example.com";

describe(analyticsPath, () => {
  it("keeps public routes and collapses the rest", () => {
    expect(analyticsPath("/portfolio/k-12-schools/")).toBe(
      "/portfolio/k-12-schools"
    );
    expect(analyticsPath("/projects/caltech-linde-hall")).toBe(
      "/projects/caltech-linde-hall"
    );
    expect(analyticsPath("/wp-login.php")).toBe("/other");
    expect(analyticsPath("/_emdash/admin")).toBe("/other");
  });
});

describe(analyticsUrl, () => {
  it("keeps UTM attribution and drops other parameters and fragments", () => {
    expect(
      analyticsUrl(
        "https://example.com/contact?email=pat@example.com&utm_source=google#form",
        host
      )
    ).toBe("https://example.com/contact?utm_source=google");
  });

  it("reduces other sites to their origin", () => {
    expect(analyticsUrl("https://news.example.org/story?id=1", host)).toBe(
      "https://news.example.org"
    );
    expect(analyticsUrl("not a url", host)).toBe("");
  });
});

const event = (
  name: string,
  properties: CaptureResult["properties"]
): CaptureResult => ({
  event: name,
  properties,
  timestamp: new Date(0),
  uuid: "u1",
});

describe(prepareAnalyticsEvent, () => {
  it("drops events that are not allowlisted", () => {
    expect(prepareAnalyticsEvent(event("$autocapture", {}), host)).toBeNull();
    expect(prepareAnalyticsEvent(null, host)).toBeNull();
  });

  it("strips unknown and nested properties", () => {
    const prepared = prepareAnalyticsEvent(
      event("$pageview", {
        $current_url: "https://example.com/about?ref=x",
        $os: "Mac OS X",
        $set: { email: "pat@example.com" },
        email: "pat@example.com",
      }),
      host
    );
    expect(prepared?.properties).toStrictEqual({
      $current_url: "https://example.com/about",
      $os: "Mac OS X",
    });
  });
});

describe(canInitializeAnalytics, () => {
  const config = {
    enabled: true,
    projectKey: "phc_test",
    proxyPath: "/abc",
    siteHost: host,
    uiHost: "https://us.posthog.com",
  };

  it("runs only on the production hostname with a key", () => {
    expect(canInitializeAnalytics(config, host)).toBeTruthy();
    expect(
      canInitializeAnalytics(config, "example-pr-1.acme.workers.dev")
    ).toBeFalsy();
    expect(
      canInitializeAnalytics({ ...config, projectKey: "" }, host)
    ).toBeFalsy();
    expect(
      canInitializeAnalytics({ ...config, enabled: false }, host)
    ).toBeFalsy();
  });
});
