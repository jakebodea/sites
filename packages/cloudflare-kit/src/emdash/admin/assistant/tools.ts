/**
 * Which of EmDash's MCP tools the in-admin assistant may use, and the guard that
 * keeps it to drafts. EmDash exposes ~70 tools; a short, safe list keeps the model
 * on task, and nothing here can publish, delete, or change the schema. An update
 * that would drop a page's sections is refused too. EmDash still checks every
 * call against the signed-in editor's role.
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

/**
 * `slug` on an update without `data` skips EmDash's draft staging and renames the
 * live URL at once. On `content_create` it only names the new draft.
 */
const LIVE_ON_UPDATE = ["slug"] as const;

const allowed = new Set<string>(ASSISTANT_TOOLS);

/** The arguments the assistant may never send to this tool. */
const forbiddenArguments = (tool: string): readonly string[] =>
  tool === "content_update"
    ? [...PUBLISHING_ARGUMENTS, ...LIVE_ON_UPDATE]
    : PUBLISHING_ARGUMENTS;

/** Why a call is refused, or `undefined` when it may run. */
export const refusal = (
  name: string,
  args: Schema.JsonObject
): string | undefined => {
  if (!allowed.has(name)) {
    return `The assistant cannot use ${name}.`;
  }
  const argument = forbiddenArguments(name).find((key) => key in args);
  return argument === undefined
    ? undefined
    : `The assistant saves drafts only; remove "${argument}" and let the editor publish.`;
};

/** The tool's schema without its forbidden arguments, so the model never sees them. */
const withoutForbidden = (tool: McpTool): JSONSchema => {
  const forbidden = new Set(forbiddenArguments(tool.name));
  return {
    ...tool.inputSchema,
    properties: Object.fromEntries(
      Object.entries(tool.inputSchema.properties ?? {}).filter(
        ([name]) => !forbidden.has(name)
      )
    ),
  };
};

const decodeArgs = Schema.decodeUnknownOption(Schema.JsonObject);

/** A `blocks` field: sections, each with its type and a stable key. */
const Sections = Schema.Array(
  Schema.Struct({ _key: Schema.String, _type: Schema.optional(Schema.String) })
);
const decodeSections = Schema.decodeUnknownOption(Sections);

/** What `content_get` answers: the entry, its field values under `item.data`. */
const decodeEntry = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      item: Schema.Struct({
        data: Schema.JsonObject,
      }),
    })
  )
);

/**
 * Sections an update would remove: for each `blocks` field in `update`, the
 * current sections whose `_key` the new array leaves out, as "field: type".
 * EmDash replaces the whole array, so a model that sends only the section it
 * changed would delete the rest of the page.
 */
export const droppedSections = (
  current: Schema.JsonObject,
  update: Schema.JsonObject
): readonly string[] =>
  Object.entries(update).flatMap(([field, value]) => {
    const next = decodeSections(value);
    const before = decodeSections(current[field]);
    if (Option.isNone(next) || Option.isNone(before)) {
      return [];
    }
    const kept = new Set(next.value.map((section) => section._key));
    return before.value.flatMap((section) =>
      kept.has(section._key)
        ? []
        : [`${field}: ${section._type ?? section._key}`]
    );
  });

const droppedSectionsRefusal = (dropped: readonly string[]): string =>
  `This update would remove sections from the page (${dropped.join(", ")}). Send the field's complete array: every section from content_get, in order, each with its _type and _key, changing only the ones you mean to. Removing a section is for a person to do in the editor.`;

/** Reads the entry an update targets and names the sections it would drop. */
const sectionsDroppedBy = async (
  args: Schema.JsonObject,
  mcp: McpConnection
): Promise<readonly string[]> => {
  const update = decodeArgs(args.data);
  // Only an update that sends sections can drop any; plain field edits skip the extra read.
  if (
    Option.isNone(update) ||
    !Object.values(update.value).some((value) =>
      Option.isSome(decodeSections(value))
    )
  ) {
    return [];
  }
  // The same entry the update names: its collection, id or slug, and locale when given.
  const target: Schema.JsonObject = Object.fromEntries(
    ["collection", "id", "locale"].flatMap((key) => {
      const value = args[key];
      return value === undefined ? [] : [[key, value]];
    })
  );
  const read = await mcp.callTool("content_get", target);
  const entry = decodeEntry(read.text);
  return read.isError || Option.isNone(entry)
    ? []
    : droppedSections(entry.value.item.data, update.value);
};

/** One allowlisted MCP tool as a TanStack server tool, with the draft-only guard in front. */
const guardedTool = (tool: McpTool, mcp: McpConnection): AnyServerTool =>
  toolDefinition({
    description: tool.description ?? tool.name,
    inputSchema: withoutForbidden(tool),
    name: tool.name,
  }).server(async (raw) => {
    const args = Option.getOrElse(decodeArgs(raw), () => ({}));
    const refused = refusal(tool.name, args);
    if (refused !== undefined) {
      return { error: refused };
    }
    if (tool.name === "content_update") {
      const dropped = await sectionsDroppedBy(args, mcp);
      if (dropped.length > 0) {
        return { error: droppedSectionsRefusal(dropped) };
      }
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
