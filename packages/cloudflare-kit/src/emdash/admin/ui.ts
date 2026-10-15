/**
 * The admin screens this kit adds, as EmDash Block Kit (declarative JSON the
 * admin renders with its own components, so they match the theme for free).
 */
import type { Block, BlockResponse } from "@emdash-cms/blocks";

import type { AgentResult } from "./assistant/agent.ts";
import { MCP_PATH } from "./assistant/mcp.ts";
import { PRESET_LABELS } from "./assistant/prompts.ts";
import type { AssistantPreset, GuideTip } from "./options.ts";

export const ACTIONS = {
  ask: "ask",
  preset: "preset",
} as const;

/** Tips stacked top to bottom: the dashboard shows this card at half width. */
export const startHereWidget = (tips: readonly GuideTip[]): BlockResponse => ({
  blocks: tips.flatMap((tip, index): Block[] => [
    ...(index === 0 ? [] : [{ type: "divider" } satisfies Block]),
    { text: tip.title, type: "header" },
    { text: tip.body, type: "context" },
    ...(tip.link === undefined
      ? []
      : [
          {
            elements: [
              {
                appearance: "secondary",
                label: tip.link.label,
                target: tip.link.target,
                type: "link",
              },
            ],
            type: "actions",
          } satisfies Block,
        ]),
  ]),
});

const askForm = (placeholder: string): Block => ({
  block_id: "ask",
  fields: [
    {
      action_id: "request",
      label: "What would you like to change?",
      multiline: true,
      placeholder,
      type: "text_input",
    },
  ],
  submit: { action_id: ACTIONS.ask, label: "Ask the assistant" },
  type: "form",
});

export const resultBlocks = (result: AgentResult): Block[] => [
  { text: result.answer, type: "section" },
  {
    text:
      result.tools.length === 0
        ? "No changes were made."
        : `Steps: ${result.tools.join(", ")}`,
    type: "context",
  },
];

export const errorBlocks = (message: string): Block[] => [
  {
    description: message,
    title: "The assistant couldn't finish",
    type: "banner",
    variant: "error",
  },
];

export const assistantPage = (result: Block[] = []): BlockResponse => ({
  blocks: [
    { text: "Assistant", type: "header" },
    {
      text: "Describe a change in plain words. The assistant edits the site the way you would and saves drafts; nothing goes live until you review it and select Publish.",
      type: "context",
    },
    ...result,
    askForm(
      'For example: "Add Riverside County to the service area on the home page" or "Make the About page intro shorter"'
    ),
    {
      text: "Tip: on any page's edit screen, the Assistant panel has one-click jobs for that page.",
      type: "context",
    },
  ],
});

export const editorPanel = (
  presets: readonly AssistantPreset[],
  result: Block[] = []
): BlockResponse => ({
  blocks: [
    ...result,
    {
      elements: presets.map((preset) => ({
        action_id: ACTIONS.preset,
        label: PRESET_LABELS[preset],
        type: "button" as const,
        value: preset,
      })),
      type: "actions",
    },
    askForm('For example: "Mention that we now serve Orange County"'),
    {
      text: "Changes are saved as a draft of this page. Review them, then select Publish.",
      type: "context",
    },
  ],
});

export const claudePage = (origin: string): BlockResponse => ({
  blocks: [
    { text: "Use with Claude", type: "header" },
    {
      text: "Claude can edit this website for you in a normal conversation, using the same tools as the built-in assistant. It signs in as you, so it can do exactly what your account can do.",
      type: "section",
    },
    {
      text: "Your site's connection address:",
      type: "context",
    },
    { code: `${origin}${MCP_PATH}`, language: "bash", type: "code" },
    {
      panels: [
        {
          blocks: [
            {
              text: "1. In Claude, open Settings, then Connectors, and select Add custom connector.",
              type: "section",
            },
            {
              text: "2. Name it after your website and paste the address above. Select Add.",
              type: "section",
            },
            {
              text: "3. Select Connect. A sign-in window for this website opens; sign in as usual and approve.",
              type: "section",
            },
            {
              text: '4. In a chat, turn the connector on and ask, for example: "Show me the home page text" or "Draft a new project called Main Street Library".',
              type: "section",
            },
          ],
          label: "Claude (web or desktop)",
        },
        {
          blocks: [
            {
              text: "Run this in a terminal, then sign in when the browser opens:",
              type: "section",
            },
            {
              code: `claude mcp add --transport http website ${origin}${MCP_PATH}`,
              language: "bash",
              type: "code",
            },
          ],
          label: "Claude Code",
        },
      ],
      type: "tab",
    },
    {
      description:
        "Ask Claude to save drafts and review them here before you select Publish. To disconnect, remove the connector in Claude.",
      title: "Good to know",
      type: "banner",
    },
  ],
});
