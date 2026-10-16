import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";

import { estimatedTokens, isLongConversation } from "./conversation-size.ts";

const turn = (text: string): UIMessage => ({
  id: "m1",
  parts: [{ content: text, type: "text" }],
  role: "user",
});

describe(isLongConversation, () => {
  it("is false for an everyday conversation and true past about 100K tokens", () => {
    expect(
      [turn("Fix the typos on About"), turn("x".repeat(400_100))].map(
        (message) => isLongConversation([message])
      )
    ).toStrictEqual([false, true]);
  });

  it("counts about four characters a token", () => {
    // The message above serializes to 88 characters: 88 / 4 = 22.
    expect(estimatedTokens([turn("Fix the typos on About")])).toBe(22);
  });
});
