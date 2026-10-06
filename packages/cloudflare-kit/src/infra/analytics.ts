import * as Output from "alchemy/Output";
/**
 * Deploy-time PostHog settings. Optional: without `POSTHOG_PROJECT_KEY` the
 * site ships no analytics script and captures no server events.
 */
import { Random } from "alchemy/Random";
import { Config, Effect, Option, Redacted } from "effect";

/** Ingestion host for PostHog US cloud; set `POSTHOG_HOST` for EU or self-hosted. */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Worker bindings for the browser and server PostHog channels. The browser
 * proxy path is a random segment, stable per stage, so blocklists cannot
 * match it by name. Requires `RandomProvider()` in the stack's providers.
 */
export const siteAnalytics = Effect.gen(function* siteAnalytics() {
  const projectKey = yield* Config.String("POSTHOG_PROJECT_KEY").pipe(
    Config.option
  );
  const host = yield* Config.String("POSTHOG_HOST").pipe(
    Config.withDefault(DEFAULT_POSTHOG_HOST)
  );
  const proxy = yield* Random("PostHogProxyPath", { bytes: 6 });
  return {
    // The project key is public (it ships to browsers); empty disables analytics.
    POSTHOG_HOST: host,
    POSTHOG_PROJECT_KEY: Option.getOrElse(projectKey, () => ""),
    POSTHOG_PROXY_PATH: proxy.text.pipe(
      Output.map((value) => `/${Redacted.value(value)}`)
    ),
  };
});
