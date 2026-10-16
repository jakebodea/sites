/**
 * Keeps a long conversation affordable without summarising it. Most of its size
 * is tool output: whole entries from content_get, lists from content_list. Tool
 * results from older turns are replaced with a short note before each model
 * call (the model can read the entry again if it needs it); the conversation the
 * panel keeps is untouched. No extra model call, nothing paraphrased, and the
 * prompt prefix stays stable between trims, so it keeps its cache.
 */
import { defineChatMiddleware } from "@tanstack/ai";
import type { ModelMessage } from "@tanstack/ai";

/** Turns whose tool results stay whole: this one and the one before it. */
export const KEEP_RECENT_TURNS = 2;

/** Short results (a refusal, "ok", a count) cost little and may still matter. */
const TRIM_OVER_CHARACTERS = 400;

const omitted = (tool: string): string =>
  `[Output of ${tool} from an earlier turn, removed to keep the conversation short. Call ${tool} again if you need it.]`;

/** Serialized length: text and content parts alike, close enough for a threshold. */
const contentLength = (content: ModelMessage["content"]): number =>
  JSON.stringify(content).length;

/**
 * The messages with tool results older than the last `keepTurns` user turns
 * shortened to a note naming the tool. Messages are not mutated.
 */
export const trimOldToolResults = (
  messages: readonly ModelMessage[],
  keepTurns: number = KEEP_RECENT_TURNS
): ModelMessage[] => {
  const userTurns = messages.flatMap((message, index) =>
    message.role === "user" ? [index] : []
  );
  const keepFrom = userTurns.at(-keepTurns) ?? 0;
  const toolNames = new Map(
    messages.flatMap((message) =>
      (message.toolCalls ?? []).map((call) => [call.id, call.function.name])
    )
  );
  return messages.map((message, index) =>
    index < keepFrom &&
    message.role === "tool" &&
    contentLength(message.content) > TRIM_OVER_CHARACTERS
      ? {
          ...message,
          content: omitted(
            toolNames.get(message.toolCallId ?? "") ?? "the tool"
          ),
        }
      : message
  );
};

/** Trims what the model sees each round; `messages` (the stored history) stays whole. */
export const trimOldToolOutput = defineChatMiddleware({
  name: "trim-old-tool-output",
  onConfig: (_ctx, config) => ({
    providerMessages: trimOldToolResults(config.messages),
  }),
});
