/**
 * One assistant turn on TanStack AI: `chat()` owns the tool loop and streams it
 * as AG-UI events (reasoning, tool calls and their results, the reply), so the
 * admin panel can show each step as it happens. EmDash's MCP server supplies
 * the tools (through the draft-only guard in `tools.ts`), and the model comes
 * from `model.ts`.
 */
import { chat, maxIterations } from "@tanstack/ai";
import type {
  AnyServerTool,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  UIMessage,
} from "@tanstack/ai";

import { emdashToolSource } from "./tools.ts";
import type { McpConnection } from "./tools.ts";

/** Enough for read, update, re-read, and a summary on a few entries; bounds cost per request. */
export const MAX_ITERATIONS = 12;

export const streamAgent = (input: {
  readonly adapter: AnyTextAdapter;
  readonly mcp: McpConnection;
  readonly systemPrompts: readonly string[];
  readonly messages: (UIMessage | ModelMessage)[];
  readonly extraTools?: readonly AnyServerTool[];
  readonly abortController?: AbortController;
}): AsyncIterable<StreamChunk> =>
  chat({
    abortController: input.abortController,
    adapter: input.adapter,
    agentLoopStrategy: maxIterations(MAX_ITERATIONS),
    // `close`: the MCP session ends with the run, including when it fails or the editor stops it.
    mcp: { clients: [emdashToolSource(input.mcp)], connection: "close" },
    messages: input.messages,
    systemPrompts: [...input.systemPrompts],
    tools: [...(input.extraTools ?? [])],
  });
