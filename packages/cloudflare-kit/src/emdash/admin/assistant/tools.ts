/**
 * Which of EmDash's MCP tools the in-admin assistant may use, and the guard that
 * keeps it to drafts. EmDash exposes ~70 tools; a short, safe list keeps the model
 * on task, and nothing here can publish, delete, or change the schema. EmDash
 * still checks every call against the signed-in editor's role.
 */
import { toolDefinition } from "@tanstack/ai";
import type { AnyServerTool, JSONSchema, MCPToolSource } from "@tanstack/ai";
import { Option, Schema } from "effect";

/** A tool as MCP `tools/list` describes it. */
export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: JSONSchema;
}

export interface McpToolResult {
  readonly isError: boolean;
  /** The tool's text output, joined; what the model reads back. */
  readonly text: string;
}

/** An open MCP session: what the assistant needs from EmDash's MCP server. */
export interface McpConnection {
  readonly listTools: () => Promise<readonly McpTool[]>;
  readonly callTool: (
    name: string,
    args: Schema.JsonObject
  ) => Promise<McpToolResult>;
  readonly close: () => Promise<void>;
}

export const ASSISTANT_TOOLS = [
  "content_list",
  "content_get",
  "content_create",
  "content_update",
  "content_compare",
  "content_translations",
  "search",
  "media_list",
  "media_get",
  "schema_list_collections",
  "schema_get_collection",
  "schema_list_block_types",
  "schema_get_block_type",
  "revision_list",
] as const;

/**
 * Arguments that would change the live site or another editor's work. EmDash
 * stages only field values as a draft: `status` and `publishedAt` publish, and
 * `seo`, `bylines`, and `taxonomies` are written to the live entry at once.
 * `overrideLock` would take over an entry someone else is editing.
 */
const PUBLISHING_ARGUMENTS = [
  "status",
  "publishedAt",
  "seo",
  "bylines",
  "taxonomies",
  "overrideLock",
] as const;

const allowed = new Set<string>(ASSISTANT_TOOLS);
const publishing = new Set<string>(PUBLISHING_ARGUMENTS);

/** Why a call is refused, or `undefined` when it may run. */
export const refusal = (
  name: string,
  args: Schema.JsonObject
): string | undefined => {
  if (!allowed.has(name)) {
    return `The assistant cannot use ${name}.`;
  }
  const argument = PUBLISHING_ARGUMENTS.find((key) => key in args);
  return argument === undefined
    ? undefined
    : `The assistant saves drafts only; remove "${argument}" and let the editor publish.`;
};

/** The tool's schema without its publishing arguments, so the model never sees them. */
const withoutPublishing = (schema: JSONSchema): JSONSchema => ({
  ...schema,
  properties: Object.fromEntries(
    Object.entries(schema.properties ?? {}).filter(
      ([name]) => !publishing.has(name)
    )
  ),
});

const decodeArgs = Schema.decodeUnknownOption(Schema.JsonObject);

/** One allowlisted MCP tool as a TanStack server tool, with the draft-only guard in front. */
const guardedTool = (tool: McpTool, mcp: McpConnection): AnyServerTool =>
  toolDefinition({
    description: tool.description ?? tool.name,
    inputSchema: withoutPublishing(tool.inputSchema),
    name: tool.name,
  }).server(async (raw) => {
    const args = Option.getOrElse(decodeArgs(raw), () => ({}));
    const refused = refusal(tool.name, args);
    if (refused !== undefined) {
      return { error: refused };
    }
    const result = await mcp.callTool(tool.name, args);
    return result.isError ? { error: result.text } : result.text;
  });

/**
 * EmDash's MCP server as a `chat({ mcp })` tool source: only the allowlist, each
 * behind the guard. The caller closes the session (see `agent.ts`).
 */
export const emdashToolSource = (mcp: McpConnection): MCPToolSource => ({
  close: mcp.close,
  tools: async () => {
    const tools = await mcp.listTools();
    return tools.flatMap((tool) =>
      allowed.has(tool.name) ? [guardedTool(tool, mcp)] : []
    );
  },
});
