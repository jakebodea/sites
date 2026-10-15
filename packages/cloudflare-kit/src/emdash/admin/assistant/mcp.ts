/**
 * EmDash's MCP server, reached in-process. The assistant speaks real MCP through
 * the SDK client, but its transport hands each request straight to EmDash's
 * `/_emdash/api/mcp` route handler with the editor's own Astro context: no
 * network hop, no API token, and the exact tools and permission checks Claude gets.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { APIContext } from "astro";
import { Schema } from "effect";

import type { McpConnection, McpTool } from "./tools.ts";

export const MCP_PATH = "/_emdash/api/mcp";

const TextParts = Schema.Array(
  Schema.Union([
    Schema.Struct({ text: Schema.String, type: Schema.Literal("text") }),
    Schema.Struct({ type: Schema.String }),
  ])
);
const decodeParts = Schema.decodeUnknownSync(TextParts);

/** Joins the text parts of an MCP `CallToolResult`; images and resources are dropped. */
export const toolResultText = (parts: typeof TextParts.Type): string =>
  parts.flatMap((part) => ("text" in part ? [part.text] : [])).join("\n");

/** Calls EmDash's MCP route with the editor's context, as if the request came over HTTP. */
const inProcessFetch =
  (context: APIContext) =>
  async (input: string | URL | Request, init?: RequestInit) => {
    // Loaded on first use: the MCP server stack is heavy and only assistant runs need it.
    // The route module is exported for Astro's router; there is no other entry to the handler.
    const { POST } = await import("emdash/internal/routes/api/mcp");
    return await POST({ ...context, request: new Request(input, init) });
  };

export const connectEmDashMcp = async (
  context: APIContext
): Promise<McpConnection> => {
  const client = new Client({ name: "site-assistant", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_PATH, context.request.url), {
      fetch: inProcessFetch(context),
    })
  );
  return {
    callTool: async (name, args) => {
      const result = await client.callTool({ arguments: args, name });
      return {
        isError: result.isError === true,
        text: toolResultText(decodeParts(result.content)),
      };
    },
    close: async () => {
      await client.close();
    },
    listTools: async () => {
      const listed = await client.listTools();
      return listed.tools.map((tool): McpTool => ({
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
      }));
    },
  };
};
