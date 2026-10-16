/**
 * A rough size of the conversation in model tokens (about four characters
 * each), to suggest a fresh start before a long conversation turns slow and
 * costly. Old tool output is trimmed before it reaches the model, so this
 * overstates what the model reads; it errs toward suggesting early.
 */
import type { UIMessage } from "@tanstack/ai-react";

const CHARACTERS_PER_TOKEN = 4;

/** Past this, the panel suggests a new conversation. */
export const LONG_CONVERSATION_TOKENS = 100_000;

export const estimatedTokens = (messages: readonly UIMessage[]): number =>
  Math.ceil(JSON.stringify(messages).length / CHARACTERS_PER_TOKEN);

export const isLongConversation = (messages: readonly UIMessage[]): boolean =>
  estimatedTokens(messages) > LONG_CONVERSATION_TOKENS;
