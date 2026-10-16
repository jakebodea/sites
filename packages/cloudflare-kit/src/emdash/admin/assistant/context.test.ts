import type { ModelMessage } from "@tanstack/ai";
import { describe, expect, it } from "vitest";

import { trimOldToolResults } from "./context.ts";

const page = `{"title":"About","body":"${"Founded in 2001. ".repeat(40)}"}`;

const read = (callId: string): ModelMessage[] => [
  {
    content: null,
    role: "assistant",
    toolCalls: [
      {
        function: { arguments: '{"id":"about"}', name: "content_get" },
        id: callId,
        type: "function",
      },
    ],
  },
  { content: page, role: "tool", toolCallId: callId },
];

/** Three turns, each reading the About page. */
const conversation: ModelMessage[] = [
  { content: "Fix typos on About", role: "user" },
  ...read("c1"),
  { content: "Done.", role: "assistant" },
  { content: "Now shorten it", role: "user" },
  ...read("c2"),
  { content: "Shortened.", role: "assistant" },
  { content: "And the title?", role: "user" },
  ...read("c3"),
];

const toolContents = (messages: ModelMessage[]) =>
  messages.flatMap((message) =>
    message.role === "tool" ? [message.content] : []
  );

describe(trimOldToolResults, () => {
  it("shortens tool output older than the last two turns to a note naming the tool", () => {
    expect(toolContents(trimOldToolResults(conversation))).toStrictEqual([
      "[Output of content_get from an earlier turn, removed to keep the conversation short. Call content_get again if you need it.]",
      page,
      page,
    ]);
  });

  it("keeps short results and every other message as they were", () => {
    const short: ModelMessage[] = [
      { content: "Publish it", role: "user" },
      {
        content: '{"error":"The assistant saves drafts only"}',
        role: "tool",
        toolCallId: "x",
      },
      { content: "Next", role: "user" },
      { content: "Again", role: "user" },
    ];
    expect(trimOldToolResults(short)).toStrictEqual(short);
    expect(trimOldToolResults(conversation)[0]).toStrictEqual({
      content: "Fix typos on About",
      role: "user",
    });
  });
});
