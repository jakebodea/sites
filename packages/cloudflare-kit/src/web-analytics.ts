import { Option, Redacted, Schema } from "effect";

import type { WebAnalyticsEnv } from "./env.ts";

const Bindings = Schema.Struct({
  CF_ANALYTICS_API_TOKEN: Schema.String,
  WEB_ANALYTICS_ACCOUNT_ID: Schema.String,
  WEB_ANALYTICS_HOSTS: Schema.String,
  WEB_ANALYTICS_SITE_TAG: Schema.String,
  WEB_ANALYTICS_TOKEN: Schema.String,
});

export interface WebAnalytics {
  readonly siteToken: string;
  readonly siteTag: string;
  readonly accountId: string;
  readonly hosts: readonly string[];
  readonly apiToken: Option.Option<Redacted.Redacted>;
}

export const webAnalyticsFromEnv = (
  env: WebAnalyticsEnv
): Option.Option<WebAnalytics> => {
  const bindings = Schema.decodeUnknownSync(Bindings)(env);
  const hosts = bindings.WEB_ANALYTICS_HOSTS.split(",")
    .map((host) => host.trim())
    .filter((host) => host !== "");
  if (
    bindings.WEB_ANALYTICS_TOKEN === "" ||
    bindings.WEB_ANALYTICS_SITE_TAG === "" ||
    bindings.WEB_ANALYTICS_ACCOUNT_ID === "" ||
    hosts.length === 0
  ) {
    return Option.none();
  }
  return Option.some({
    accountId: bindings.WEB_ANALYTICS_ACCOUNT_ID,
    apiToken:
      bindings.CF_ANALYTICS_API_TOKEN === ""
        ? Option.none()
        : Option.some(Redacted.make(bindings.CF_ANALYTICS_API_TOKEN)),
    hosts,
    siteTag: bindings.WEB_ANALYTICS_SITE_TAG,
    siteToken: bindings.WEB_ANALYTICS_TOKEN,
  });
};
