// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, typescript/no-unsafe-type-assertion -- the model's tool arguments and EmDash's tool output reach the panel as untyped JSON text; this module is that boundary, and islands cannot load Effect Schema to decode them.
/**
 * Reads the few fields the panel shows from a tool call's JSON: what it
 * acted on, and whether the result was a refusal. Anything unexpected reads
 * as "nothing to show".
 */

export interface ToolArgs {
  readonly collection?: string;
  readonly id?: string;
  readonly slug?: string;
  readonly query?: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const parse = (json: string): Json | undefined => {
  try {
    // SAFETY: JSON.parse only ever produces JSON values.
    return JSON.parse(json) as Json;
  } catch {
    return undefined;
  }
};

const field = (value: Json | undefined, key: string): string | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const found = value[key];
  return typeof found === "string" && found !== "" ? found : undefined;
};

export const readToolArgs = (json: string): ToolArgs => {
  const value = parse(json);
  return {
    collection: field(value, "collection"),
    id: field(value, "id"),
    query: field(value, "query"),
    slug: field(value, "slug"),
  };
};

/** The draft-only guard answers `{ "error": "..." }` instead of throwing, so the model can recover. */
export const readToolError = (json: string): string | undefined =>
  field(parse(json), "error");

/** JSON indented for reading; other text as it came. */
export const prettyJson = (text: string): string => {
  const value = parse(text);
  return value === undefined ? text : JSON.stringify(value, null, 2);
};
