/**
 * The Block Kit interactions this plugin acts on, parsed from the route input.
 * Anything else (a page load we don't special-case, an unknown button) decodes
 * to `None` and simply re-renders the screen.
 */
import { Schema } from "effect";

import { ACTIONS } from "./ui.ts";

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

const Ask = Schema.Struct({
  action_id: Schema.Literal(ACTIONS.ask),
  type: Schema.Literal("form_submit"),
  values: Schema.Struct({ request: Schema.Trim.check(Schema.isNonEmpty()) }),
});

const RunPreset = Schema.Struct({
  action_id: Schema.Literal(ACTIONS.preset),
  type: Schema.Literal("block_action"),
  value: Preset,
});

const Interaction = Schema.Union([PageLoad, Ask, RunPreset]);
export type Interaction = typeof Interaction.Type;

export const decodeInteraction = Schema.decodeUnknownOption(Interaction);
