import type { JSONSchema } from "@tanstack/ai";
import { fakeText } from "@tanstack/ai/testing";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { runAgent } from "./agent.ts";
import { refusal } from "./tools.ts";
import type { McpConnection, McpTool } from "./tools.ts";

const schema = (properties: Record<string, JSONSchema>): JSONSchema => ({
  properties,
  type: "object",
});

/** EmDash's MCP server is an external system: this fake records calls and answers from a script. */
const fakeEmDash = (answers: Record<string, string>) => {
  const calls: { name: string; args: Schema.JsonObject }[] = [];
  const tools: McpTool[] = [
    { inputSchema: schema({ collection: {}, id: {} }), name: "content_get" },
    {
      inputSchema: schema({ data: {}, id: {}, status: {} }),
      name: "content_update",
    },
    { inputSchema: schema({ id: {} }), name: "content_permanent_delete" },
  ];
  const connection: McpConnection = {
    // Each method yields once, like the real server answering a request.
    callTool: async (name, args) => {
      calls.push({ args, name });
      await Promise.resolve();
      return { isError: false, text: answers[name] ?? "ok" };
    },
    close: async () => {
      await Promise.resolve();
    },
    listTools: async () => {
      await Promise.resolve();
      return tools;
    },
  };
  return { calls, connection };
};

describe(runAgent, () => {
  it("runs the model's MCP calls and returns its final answer with the steps", async () => {
    const emdash = fakeEmDash({ content_get: '{"title":"About","_rev":"r1"}' });
    const model = fakeText();
    model.setResponses([
      {
        toolCalls: [
          { input: { collection: "pages", id: "about" }, name: "content_get" },
        ],
      },
      {
        toolCalls: [
          {
            input: { _rev: "r1", data: { intro: "Shorter." }, id: "about" },
            name: "content_update",
          },
        ],
      },
      { text: "I shortened the About intro and saved it as a draft." },
    ]);

    const result = await runAgent({
      adapter: model,
      mcp: emdash.connection,
      prompt: "Shorten the About intro",
      system: "test",
    });

    expect(result).toStrictEqual({
      answer: "I shortened the About intro and saved it as a draft.",
      tools: ["content_get", "content_update"],
    });
    expect(emdash.calls).toStrictEqual([
      { args: { collection: "pages", id: "about" }, name: "content_get" },
      {
        args: { _rev: "r1", data: { intro: "Shorter." }, id: "about" },
        name: "content_update",
      },
    ]);
  });

  it("never forwards a publish to EmDash", async () => {
    const emdash = fakeEmDash({});
    const model = fakeText();
    model.setResponses([
      {
        toolCalls: [
          {
            input: { id: "about", status: "published" },
            name: "content_update",
          },
        ],
      },
      { text: "I could not publish; the draft is ready for you." },
    ]);

    const result = await runAgent({
      adapter: model,
      mcp: emdash.connection,
      prompt: "Publish the About page",
      system: "test",
    });

    expect(result.answer).toBe(
      "I could not publish; the draft is ready for you."
    );
    expect(emdash.calls).toStrictEqual([]);
  });
});

const draftsOnly = (argument: string) =>
  `The assistant saves drafts only; remove "${argument}" and let the editor publish.`;

describe(refusal, () => {
  it.each([
    [
      "content_permanent_delete",
      {},
      "The assistant cannot use content_permanent_delete.",
    ],
    [
      "media_update",
      { alt: "A roof", id: "m1" },
      "The assistant cannot use media_update.",
    ],
    [
      "content_create",
      { publishedAt: "2020-01-01" },
      draftsOnly("publishedAt"),
    ],
    ["content_update", { id: "a", seo: { title: "New" } }, draftsOnly("seo")],
    ["content_update", { id: "a", slug: "new-url" }, draftsOnly("slug")],
  ] as const)("refuses %s with %j", (tool, args, reason) => {
    expect(refusal(tool, args)).toBe(reason);
  });

  it("allows a slug only where it names a new draft", () => {
    expect(
      refusal("content_create", { data: {}, slug: "new-page" })
    ).toBeUndefined();
    expect(refusal("content_update", { id: "a", slug: "new-page" })).toBe(
      draftsOnly("slug")
    );
    expect(
      refusal("content_update", { data: { intro: "Hi" }, id: "a" })
    ).toBeUndefined();
  });
});
