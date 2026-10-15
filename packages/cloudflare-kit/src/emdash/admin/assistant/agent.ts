/**
 * One assistant run on TanStack AI: `chat()` owns the tool loop, EmDash's MCP
 * server supplies the tools (through the draft-only guard in `tools.ts`), and
 * the model comes from `model.ts`. Returns the answer plus which tools ran, so
 * the panel can show what happened.
 */
import { chat, maxIterations } from "@tanstack/ai";
import type { AnyServerTool, AnyTextAdapter, StreamChunk } from "@tanstack/ai";

import { emdashToolSource } from "./tools.ts";
import type { McpConnection } from "./tools.ts";

/** Enough for read, update, re-read, and a summary on a few entries; bounds cost per request. */
export const MAX_ITERATIONS = 12;

export interface AgentResult {
  /** The model's final message for the editor. */
  readonly answer: string;
  /** Tool names in the order they ran. */
  readonly tools: readonly string[];
}

/** Tool names from a run's `TOOL_CALL_START` events, in order. */
export const toolsUsed = (chunks: readonly StreamChunk[]): string[] =>
  chunks.flatMap((chunk) =>
    chunk.type === "TOOL_CALL_START" ? [chunk.toolCallName] : []
  );

export const runAgent = async (input: {
  readonly adapter: AnyTextAdapter;
  readonly mcp: McpConnection;
  readonly system: string;
  readonly prompt: string;
  readonly extraTools?: readonly AnyServerTool[];
}): Promise<AgentResult> => {
  const result = await chat({
    adapter: input.adapter,
    agentLoopStrategy: maxIterations(MAX_ITERATIONS),
    // The plugin route owns the session and closes it, even when the run fails.
    mcp: { clients: [emdashToolSource(input.mcp)], connection: "keep-alive" },
    messages: [{ content: input.prompt, role: "user" }],
    stream: false,
    systemPrompts: [input.system],
    tools: [...(input.extraTools ?? [])],
  });
  return {
    answer: result.text.trim() || "Done.",
    tools: toolsUsed(result.chunks),
  };
};
