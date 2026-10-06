import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import type * as Output from "alchemy/Output";
import type { Redacted } from "effect";
import { Config, Effect, Option } from "effect";

import type { WebAnalyticsEnv } from "../env.ts";
import type { StageSettings } from "./stage.ts";

export const webAnalytics = (stage: StageSettings) =>
  Effect.gen(function* createWebAnalytics() {
    const { dev } = yield* AlchemyContext;
    if (!stage.production || dev) {
      return {
        CF_ANALYTICS_API_TOKEN: "",
        WEB_ANALYTICS_ACCOUNT_ID: "",
        WEB_ANALYTICS_HOSTS: "",
        WEB_ANALYTICS_SITE_TAG: "",
        WEB_ANALYTICS_TOKEN: "",
      } satisfies Record<
        keyof WebAnalyticsEnv,
        string | Redacted.Redacted | Output.Output<string>
      >;
    }
    const host = new URL(stage.origin).hostname;
    const site = yield* Cloudflare.Rum.Site("WebAnalytics", { host });
    const token = yield* Config.Redacted("CF_ANALYTICS_API_TOKEN").pipe(
      Config.option
    );
    if (Option.isNone(token)) {
      yield* Effect.logWarning(
        "analytics token missing; the plugin will show its setup check"
      );
    }
    return {
      CF_ANALYTICS_API_TOKEN: Option.getOrElse(token, () => ""),
      WEB_ANALYTICS_ACCOUNT_ID: site.accountId,
      WEB_ANALYTICS_HOSTS: (stage.domain === undefined
        ? [host]
        : [host, `www.${host}`]
      ).join(","),
      WEB_ANALYTICS_SITE_TAG: site.siteTag,
      WEB_ANALYTICS_TOKEN: site.siteToken,
    } satisfies Record<
      keyof WebAnalyticsEnv,
      string | Redacted.Redacted | Output.Output<string>
    >;
  });
