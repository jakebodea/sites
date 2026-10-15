// oxlint-disable-next-line typescript/triple-slash-reference -- ambient `cloudflare:workers` types for node-side tsconfigs.
/// <reference path="../cloudflare-workers.d.ts" />
/**
 * `POST /_emdash/api/site-admin/assistant`: one assistant turn, streamed as
 * Server-Sent Events for the admin panel's `useChat`. EmDash's middleware has
 * already required a session and its CSRF header (the path is under
 * `/_emdash/api`); this route checks the editor may edit content, then runs
 * the agent with EmDash's MCP tools as that editor.
 */
import { hasPermission } from "@emdash-cms/auth";
import {
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import type { APIRoute } from "astro";
import { Option, Predicate, Schema } from "effect";
import cmsAdmin from "virtual:cms-admin-config";

import { streamAgent } from "./assistant/agent.ts";
import { connectEmDashMcp } from "./assistant/mcp.ts";
import { offlineAdapter, workersAiAdapter } from "./assistant/model.ts";
import type { WorkersAiBinding } from "./assistant/model.ts";
import { describePhotoTool } from "./assistant/photo.ts";
import type { Photo } from "./assistant/photo.ts";
import {
  openEntryPrompt,
  presetRunPrompt,
  systemPrompt,
} from "./assistant/prompts.ts";
import type { EntryRef } from "./assistant/prompts.ts";
import { Preset } from "./interactions.ts";
import { DEFAULT_ASSISTANT_MODEL, DEFAULT_PRESETS } from "./options.ts";

export const prerender = false;

const TurnContext = Schema.Struct({
  entry: Schema.optional(
    Schema.Struct({ collection: Schema.String, id: Schema.String })
  ),
  preset: Schema.optional(Preset),
});
const decodeTurnContext = Schema.decodeUnknownOption(TurnContext);

const MediaItem = Schema.Struct({
  item: Schema.Struct({ mimeType: Schema.String, storageKey: Schema.String }),
});
const decodeMediaItem = Schema.decodeUnknownOption(MediaItem);

const isWorkersAi = (value: unknown): value is WorkersAiBinding =>
  Predicate.hasProperty(value, "run") && Predicate.isFunction(value.run);

const problem = (status: number, message: string) =>
  Response.json({ error: { message } }, { status });

const handleAssistantTurn: APIRoute = async (context) => {
  const { assistant } = cmsAdmin;
  if (assistant === false) {
    return problem(404, "The assistant is turned off on this site.");
  }
  if (!hasPermission(context.locals.user, "content:edit_own")) {
    return problem(403, "Your account cannot edit content.");
  }
  let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
  try {
    params = await chatParamsFromRequestBody(await context.request.json());
  } catch {
    return problem(400, "That request was not a chat turn.");
  }
  const turn = Option.getOrElse(
    decodeTurnContext(params.forwardedProps),
    (): typeof TurnContext.Type => ({})
  );
  const entry: EntryRef | undefined =
    turn.entry === undefined ? undefined : { ...turn.entry, locale: null };
  const presets = assistant.presets ?? DEFAULT_PRESETS;

  const { env } = await import("cloudflare:workers");
  const binding =
    Predicate.hasProperty(env, "AI") && isWorkersAi(env.AI)
      ? env.AI
      : undefined;
  const gatewayId =
    Predicate.hasProperty(env, "AI_GATEWAY_ID") &&
    Predicate.isString(env.AI_GATEWAY_ID)
      ? env.AI_GATEWAY_ID
      : "";
  const adapter =
    binding === undefined
      ? offlineAdapter(entry?.collection ?? "pages")
      : workersAiAdapter({
          binding,
          gatewayId,
          model: assistant.model ?? DEFAULT_ASSISTANT_MODEL,
        });

  const { emdash } = context.locals;
  const readPhoto = async (id: string): Promise<Photo | null> => {
    const found = await emdash.handleMediaGet(id);
    const media = Option.getOrUndefined(decodeMediaItem(found.data));
    if (!found.success || media === undefined || emdash.storage === null) {
      return null;
    }
    const file = await emdash.storage.download(media.item.storageKey);
    const bytes = new Uint8Array(await new Response(file.body).arrayBuffer());
    return { bytes, mimeType: media.item.mimeType };
  };
  const extraTools = presets.includes("alt-text")
    ? [describePhotoTool(readPhoto, adapter)]
    : [];

  const systemPrompts = [systemPrompt(cmsAdmin.siteName)];
  if (entry !== undefined) {
    systemPrompts.push(openEntryPrompt(entry));
    if (turn.preset !== undefined && presets.includes(turn.preset)) {
      systemPrompts.push(
        presetRunPrompt(turn.preset, entry, assistant.locales ?? [])
      );
    }
  }

  // Stop in the panel aborts the fetch; that ends the model call and the tool loop.
  const abortController = new AbortController();
  context.request.signal.addEventListener("abort", () => {
    abortController.abort();
  });
  const mcp = await connectEmDashMcp(context);
  return toServerSentEventsResponse(
    streamAgent({
      abortController,
      adapter,
      extraTools,
      mcp,
      messages: params.messages,
      systemPrompts,
    }),
    { abortController, headers: { "Cache-Control": "private, no-store" } }
  );
};

export const POST = handleAssistantTurn;
