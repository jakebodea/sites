import type { Option, Redacted } from "effect";

export type AnalyticsPluginSettings =
  | {
      readonly provider: "cloudflare";
      readonly cfAccountId: string;
      readonly cfSiteTag: string;
      readonly hosts: string;
      readonly cfApiToken: Option.Option<Redacted.Redacted>;
    }
  | { readonly provider: "demo" };
