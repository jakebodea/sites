/**
 * One assistant turn on TanStack AI: `chat()` owns the tool loop and streams it
 * as AG-UI events (reasoning, tool calls and their results, the reply), so the
 * admin panel can show each step as it happens. EmDash's MCP server supplies
 * the tools (through the draft-only guard in `tools.ts`), the model comes from
 * `model.ts`, and `skills.ts` the know-how it loads on demand.
 */
import { chat, defineChatMiddleware, maxIterations } from "@tanstack/ai";
import type {
  AnyServerTool,
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  UIMessage,
} from "@tanstack/ai";
import { withSkills } from "@tanstack/ai-skills";
import type { SkillSource } from "@tanstack/ai-skills";

import { trimOldToolOutput } from "./context.ts";
import { emdashToolSource } from "./tools.ts";
import type { McpConnection } from "./tools.ts";

/** Enough for read, update, re-read, and a summary on a few entries; bounds cost per request. */
export const MAX_ITERATIONS = 12;

export const LAST_ROUND_PROMPT =
  "This is your last step in this turn: you cannot use tools now. Reply to the person: what you changed (by entry title), what is still left to do, and that they can ask you to continue.";

/**
 * The last round runs without tools, so a job that needs more rounds than the
 * cap ends with a summary of where it stopped instead of cutting off mid-step.
 */
const lastRoundSummary = defineChatMiddleware({
  name: "last-round-summary",
  onConfig: (ctx, config) =>
    ctx.iteration === MAX_ITERATIONS - 1
      ? {
          systemPrompts: [...config.systemPrompts, LAST_ROUND_PROMPT],
          tools: [],
        }
      : undefined,
});

export const streamAgent = (input: {
  readonly adapter: AnyTextAdapter;
  readonly mcp: McpConnection;
  readonly systemPrompts: readonly string[];
  readonly messages: (UIMessage | ModelMessage)[];
  readonly extraTools?: readonly AnyServerTool[];
  readonly skills?: SkillSource;
  readonly reasoning?: "low" | "high";
  readonly abortController?: AbortController;
}): AsyncIterable<StreamChunk> =>
  chat({
    abortController: input.abortController,
    adapter: input.adapter,
    agentLoopStrategy: maxIterations(MAX_ITERATIONS),
    // `close`: the MCP session ends with the run, including when it fails or the editor stops it.
    mcp: { clients: [emdashToolSource(input.mcp)], connection: "close" },
    messages: input.messages,
    // Skills first: they add load_skill, which the last round removes with the rest.
    middleware:
      input.skills === undefined
        ? [lastRoundSummary, trimOldToolOutput]
        : [withSkills(input.skills), lastRoundSummary, trimOldToolOutput],
    // One call at a time: two parallel updates to one entry race on its _rev.
    modelOptions: { parallel_tool_calls: false },
    reasoning: input.reasoning,
    systemPrompts: [...input.systemPrompts],
    tools: [...(input.extraTools ?? [])],
  });
