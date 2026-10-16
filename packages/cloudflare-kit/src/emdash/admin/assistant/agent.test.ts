import { EventType } from "@tanstack/ai";
import type { JSONSchema, StreamChunk } from "@tanstack/ai";
import { fakeText } from "@tanstack/ai/testing";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { streamAgent } from "./agent.ts";
import { assistantSkills } from "./skills.ts";
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

/** Drains one streamed turn into what the panel would show: the tools that ran and the reply. */
const runTurn = async (
  input: Omit<
    Parameters<typeof streamAgent>[0],
    "messages" | "systemPrompts"
  > & {
    readonly prompt: string;
  }
) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of streamAgent({
    ...input,
    messages: [{ content: input.prompt, role: "user" }],
    systemPrompts: ["test"],
  })) {
    chunks.push(chunk);
  }
  return {
    answer: chunks
      .flatMap((chunk) =>
        chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []
      )
      .join(""),
    // Serialized: a result may be text or content parts; the tests look for phrases in either.
    results: chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT
        ? [JSON.stringify(chunk.content)]
        : []
    ),
    tools: chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_START ? [chunk.toolCallName] : []
    ),
  };
};

describe(streamAgent, () => {
  it("streams the model's MCP calls and its final answer", async () => {
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

    const result = await runTurn({
      adapter: model,
      mcp: emdash.connection,
      prompt: "Shorten the About intro",
    });

    expect(result.answer).toBe(
      "I shortened the About intro and saved it as a draft."
    );
    expect(result.tools).toStrictEqual(["content_get", "content_update"]);
    expect(emdash.calls).toStrictEqual([
      { args: { collection: "pages", id: "about" }, name: "content_get" },
      {
        args: { _rev: "r1", data: { intro: "Shorter." }, id: "about" },
        name: "content_update",
      },
    ]);
  });

  it("loads a skill's instructions when the model asks for one", async () => {
    const emdash = fakeEmDash({});
    const model = fakeText();
    model.setResponses([
      { toolCalls: [{ input: { name: "page-sections" }, name: "load_skill" }] },
      { text: "Which section should the new banner go after?" },
    ]);

    const result = await runTurn({
      adapter: model,
      mcp: emdash.connection,
      prompt: "Add a banner to the home page",
      skills: assistantSkills(),
    });

    expect(result.tools).toStrictEqual(["load_skill"]);
    expect(result.results.join("")).toContain(
      "Never change or drop an existing `_key`"
    );
    expect(result.answer).toBe("Which section should the new banner go after?");
  });

  it("offers a site's own skill beside the shared ones", async () => {
    const model = fakeText();
    model.setResponses([
      {
        toolCalls: [{ input: { name: "house-style" }, name: "load_skill" }],
      },
      { text: "I will say affordable rather than cheap." },
    ]);

    const result = await runTurn({
      adapter: model,
      mcp: fakeEmDash({}).connection,
      prompt: "Can you say we are cheap?",
      skills: assistantSkills([
        {
          description: "Words this business uses and avoids.",
          instructions: "Never call the work cheap; say affordable.",
          name: "house-style",
        },
      ]),
    });

    expect(result.results.join("")).toContain(
      "Never call the work cheap; say affordable."
    );
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

    const result = await runTurn({
      adapter: model,
      mcp: emdash.connection,
      prompt: "Publish the About page",
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
