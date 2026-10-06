// oxlint-disable-next-line typescript/triple-slash-reference -- ambient `cloudflare:workers` types for node-side tsconfigs (astro.config) that import this plugin.
/// <reference path="./cloudflare-workers.d.ts" />
/**
 * EmDash email transport (`email:deliver`) backed by the same Effect `Email`
 * service as lead notifications, so CMS invites, magic links, and recovery
 * mail go out through Cloudflare Email Service.
 *
 * Register it only once a verified sender exists (see the site's
 * `astro.config.ts`); without it EmDash reports "Email is not configured" and
 * admins copy invite links by hand, which is the honest fallback.
 */
import { Effect, Predicate } from "effect";
import type { PluginDescriptor } from "emdash";
import { definePlugin } from "emdash";

import { Email, emailCloudflare } from "../server/email.ts";
import type { CloudflareEmailBinding } from "../server/email.ts";

export interface EmailPluginOptions {
  /** Verified sender, e.g. `{ email: "cms@mail.example.com", name: "Example CMS" }`. */
  readonly from: { readonly email: string; readonly name?: string };
  /** Worker binding name of the `send_email` binding. */
  readonly binding?: string;
  readonly replyTo?: string;
}

const PLUGIN_ID = "site-email";

const isEmailBinding = (value: unknown): value is CloudflareEmailBinding =>
  typeof value === "object" &&
  value !== null &&
  "send" in value &&
  typeof value.send === "function";

/** Entry point EmDash's integration bundles; use {@link emailPlugin} in astro config. */
export const createPlugin = (options: EmailPluginOptions) =>
  definePlugin({
    capabilities: ["hooks.email-transport:register"],
    hooks: {
      "email:deliver": {
        exclusive: true,
        handler: async (event) => {
          const { env } = await import("cloudflare:workers");
          const bindingName = options.binding ?? "EMAIL";
          const binding = Predicate.hasProperty(env, bindingName)
            ? env[bindingName]
            : undefined;
          if (!isEmailBinding(binding)) {
            throw new Error(
              `send_email binding "${bindingName}" is missing; bind it in alchemy.run.ts.`
            );
          }
          const { message } = event;
          const send = Effect.gen(function* send() {
            const email = yield* Email;
            yield* email.send({
              cc: message.cc,
              from: {
                email: options.from.email,
                name: options.from.name ?? options.from.email,
              },
              html: message.html,
              replyTo: message.replyTo ?? options.replyTo,
              subject: message.subject,
              text: message.text,
              to: message.to,
            });
          });
          await Effect.runPromise(
            send.pipe(Effect.provide(emailCloudflare(binding)))
          );
        },
      },
    },
    id: PLUGIN_ID,
    version: "1.0.0",
  });

export default createPlugin;

/** Descriptor for `emdash({ plugins: [emailPlugin({ from })] })`. */
export const emailPlugin = (options: EmailPluginOptions): PluginDescriptor => ({
  capabilities: ["hooks.email-transport:register"],
  entrypoint: "@jakebodea/cloudflare-kit/emdash/email-plugin",
  format: "native",
  id: PLUGIN_ID,
  options,
  version: "1.0.0",
});
