/**
 * The Block Kit interactions this plugin acts on, parsed from the route input.
 * Anything else decodes to `None` and simply re-renders the screen.
 */
import { Schema } from "effect";

export const Preset = Schema.Literals([
  "polish",
  "seo",
  "alt-text",
  "translate",
]);

const PageLoad = Schema.Struct({
  page: Schema.String,
  type: Schema.Literal("page_load"),
});
export type Interaction = typeof PageLoad.Type;

export const decodeInteraction = Schema.decodeUnknownOption(PageLoad);
