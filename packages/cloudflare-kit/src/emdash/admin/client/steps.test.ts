import type { UIMessage } from "@tanstack/ai-react";
import { describe, expect, it } from "vitest";

import { openEntryFromPath } from "./open-entry.ts";
import { messageSteps, messageText, savedDraft } from "./steps.ts";

/** An assistant turn as `useChat` holds it after the stream: think, read, save, reply. */
const finishedTurn: UIMessage = {
  id: "m1",
  parts: [
    { content: "Read the page first.", type: "thinking" },
    {
      arguments: '{"collection":"pages","id":"about"}',
      id: "call-1",
      input: { collection: "pages", id: "about" },
      name: "content_get",
      state: "input-complete",
      type: "tool-call",
    },
    {
      content: '{"title":"About"}',
      state: "complete",
      toolCallId: "call-1",
      type: "tool-result",
    },
    {
      arguments: '{"id":"about","status":"published"}',
      id: "call-2",
      input: { id: "about", status: "published" },
      name: "content_update",
      state: "input-complete",
      type: "tool-call",
    },
    {
      content: '{"error":"The assistant saves drafts only"}',
      state: "complete",
      toolCallId: "call-2",
      type: "tool-result",
    },
    { content: "I could not publish.", type: "text" },
  ],
  role: "assistant",
};

describe(messageSteps, () => {
  it("lists reasoning and each tool call in plain words, with what it touched", () => {
    expect(
      messageSteps(finishedTurn, false).map((step) =>
        step.kind === "tool"
          ? [step.title, step.target, step.status]
          : ["reasoning", step.text, step.running]
      )
    ).toStrictEqual([
      ["reasoning", "Read the page first.", false],
      ["Read an entry", "pages / about", "done"],
      ["Couldn't save a draft", "about", "failed"],
    ]);
  });

  it("shows a call without a result as running while streaming and failed once stopped", () => {
    const pending: UIMessage = {
      id: "m2",
      parts: [
        {
          arguments: '{"query":"roof"}',
          id: "call-3",
          name: "search",
          state: "input-complete",
          type: "tool-call",
        },
      ],
      role: "assistant",
    };
    expect(messageSteps(pending, true)).toMatchObject([
      { status: "running", target: '"roof"', title: "Searching the site" },
    ]);
    expect(messageSteps(pending, false)).toMatchObject([
      { status: "failed", title: "Couldn't search the site" },
    ]);
  });

  it("names a loaded skill in words", () => {
    const loaded: UIMessage = {
      id: "m3",
      parts: [
        {
          arguments: '{"name":"business-facts"}',
          id: "call-4",
          name: "load_skill",
          state: "input-complete",
          type: "tool-call",
        },
        {
          content: '{"skill":"business-facts","content":"Founded: 2001."}',
          state: "complete",
          toolCallId: "call-4",
          type: "tool-result",
        },
      ],
      role: "assistant",
    };
    expect(messageSteps(loaded, false)).toMatchObject([
      { status: "done", target: "business facts", title: "Read up" },
    ]);
  });
});

describe(messageText, () => {
  it("joins the reply's text parts", () => {
    expect(messageText(finishedTurn)).toBe("I could not publish.");
  });
});

describe(savedDraft, () => {
  it("is true only when a content write succeeded", () => {
    expect(savedDraft(finishedTurn)).toBeFalsy();
    const saved: UIMessage = {
      ...finishedTurn,
      parts: [
        {
          arguments: '{"id":"about"}',
          id: "call-4",
          name: "content_update",
          state: "input-complete",
          type: "tool-call",
        },
        {
          content: '{"id":"about"}',
          state: "complete",
          toolCallId: "call-4",
          type: "tool-result",
        },
      ],
    };
    expect(savedDraft(saved)).toBeTruthy();
  });
});

describe(openEntryFromPath, () => {
  it("reads the collection and id of the entry being edited", () => {
    expect(
      openEntryFromPath("/_emdash/admin/content/pages/01HXYZ")
    ).toStrictEqual({
      collection: "pages",
      id: "01HXYZ",
    });
    expect(
      openEntryFromPath("/_emdash/admin/content/pages/new")
    ).toBeUndefined();
    expect(openEntryFromPath("/_emdash/admin/content/pages")).toBeUndefined();
  });
});
