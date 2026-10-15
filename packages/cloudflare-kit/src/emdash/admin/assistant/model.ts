/**
 * The model behind the assistant: Workers AI through TanStack's Cloudflare
 * adapter, on the `env.AI` binding and routed through the stage's AI Gateway
 * (rate limits, logs). Local dev has no Workers AI emulation, so without
 * `AI_REMOTE=1` it gets a scripted stand-in that still makes one real MCP call.
 */
import type { AnyTextAdapter } from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import { fakeText } from "@tanstack/ai/testing";

export const OFFLINE_NOTE =
  "The assistant is offline in local development, so this is a stand-in answer. Start the site with AI_REMOTE=1 to use the real model.";

/** `env.AI`; typed loosely so this module does not pin a workers-types version. */
export type WorkersAiBinding = Parameters<
  typeof createCloudflareText
>[1] extends infer Config
  ? Config extends { binding: infer Binding }
    ? Binding
    : never
  : never;

export const workersAiAdapter = (options: {
  readonly binding: WorkersAiBinding;
  readonly model: string;
  readonly gatewayId: string;
}): AnyTextAdapter =>
  createCloudflareText(options.model, {
    binding: options.binding,
    ...(options.gatewayId !== "" && { gateway: { id: options.gatewayId } }),
  });

/**
 * Local-dev stand-in: thinks, lists a few entries through the real MCP tools,
 * then answers, so the panel's reasoning and tool steps, the tool loop, and
 * EmDash's permission checks all run without a model.
 */
export const offlineAdapter = (collection: string): AnyTextAdapter => {
  const fake = fakeText({ model: "offline" });
  fake.setResponses([
    {
      thinking: `No model is connected, so I will check the connection instead: list a few "${collection}" entries through EmDash's MCP tools.`,
      toolCalls: [{ input: { collection, limit: 3 }, name: "content_list" }],
    },
    {
      text: `${OFFLINE_NOTE} It read the "${collection}" list through EmDash's MCP tools, so the connection works.`,
    },
  ]);
  return fake;
};
