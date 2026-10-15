/**
 * The admin screens this kit adds, as EmDash Block Kit (declarative JSON the
 * admin renders with its own components, so they match the theme for free).
 */
import type { Block, BlockResponse } from "@emdash-cms/blocks";

import { MCP_PATH } from "./assistant/mcp.ts";
import type { GuideTip } from "./options.ts";

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

export const claudePage = (origin: string): BlockResponse => ({
  blocks: [
    { text: "Use with Claude", type: "header" },
    {
      text: "Claude can edit this website for you in a normal conversation, using the same tools as the assistant in the top bar. It signs in as you, so it can do exactly what your account can do.",
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
