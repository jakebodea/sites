/**
 * Request-scoped Effect wiring for server code (Astro actions). Every service
 * reads its configuration from the Worker env through one ConfigProvider, so
 * secrets resolve once, at layer construction, as `Redacted` values.
 */
import {
  LeadMailFromConfig,
  TurnstileLive,
  WaitUntil,
  emailFromEnv,
} from "@jakebodea/cloudflare-kit/server";
import { env, waitUntil } from "cloudflare:workers";
import { ConfigProvider, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { LeadStoreD1 } from "./leads.ts";

export { waitUntil } from "cloudflare:workers";

const configLayer = () => ConfigProvider.layer(ConfigProvider.fromUnknown(env));

/** Every service the contact pipeline needs, for one request. */
export const contactLayer = () =>
  Layer.mergeAll(
    TurnstileLive,
    LeadStoreD1,
    emailFromEnv(env.EMAIL),
    LeadMailFromConfig
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(WaitUntil, waitUntil)),
    Layer.provide(configLayer())
  );
