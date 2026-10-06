/**
 * Request-scoped Effect wiring for server code (Astro actions). Every service
 * reads its configuration from the Worker env through one ConfigProvider, so
 * secrets resolve once, at layer construction, as `Redacted` values.
 */
import {
  AnalyticsPostHog,
  AxiomTelemetry,
  EmailLog,
  LeadInboxFromConfig,
  TurnstileLive,
  WaitUntil,
  emailCloudflare,
} from "@jakebodea/cloudflare-kit/server";
import type { CloudflareEmailBinding } from "@jakebodea/cloudflare-kit/server";
import { env, waitUntil } from "cloudflare:workers";
import { ConfigProvider, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { site } from "../../site.config.ts";
import { LeadStoreEmDash } from "./leads.ts";

export { waitUntil } from "cloudflare:workers";

/** Adapts Cloudflare's overloaded `send_email` binding to the single-signature interface. */
const emailBinding = (binding: SendEmail): CloudflareEmailBinding => ({
  send: async (message) => {
    const builder: EmailMessageBuilder = {
      from: message.from,
      subject: message.subject,
      text: message.text,
      to: message.to,
    };
    if (message.cc !== undefined) {
      builder.cc = [...message.cc];
    }
    if (message.html !== undefined) {
      builder.html = message.html;
    }
    if (message.replyTo !== undefined) {
      builder.replyTo = message.replyTo;
    }
    return await binding.send(builder);
  },
});

const configLayer = () => ConfigProvider.layer(ConfigProvider.fromUnknown(env));

/** Every service the contact pipeline needs, for one request. */
export const contactLayer = () =>
  Layer.mergeAll(
    TurnstileLive,
    LeadStoreEmDash,
    env.EMAIL === undefined
      ? EmailLog
      : emailCloudflare(emailBinding(env.EMAIL)),
    LeadInboxFromConfig,
    AnalyticsPostHog,
    AxiomTelemetry({ environment: env.STAGE, serviceName: site.id })
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(WaitUntil, waitUntil)),
    Layer.provide(configLayer())
  );
