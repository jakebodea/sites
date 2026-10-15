// oxlint-disable-next-line typescript/triple-slash-reference -- consuming Astro config tsconfigs need the shared asset declaration.
/// <reference path="./assets.d.ts" />
/**
 * The admin screens this kit adds, as EmDash Block Kit (declarative JSON the
 * admin renders with its own components, so they match the theme for free).
 */
import type { Block, BlockResponse } from "@emdash-cms/blocks";

import claudeLogo from "./assets/claude.svg?url&no-inline";
import openaiLogo from "./assets/openai.svg?url&no-inline";
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

export const connectorsPage = (origin: string): BlockResponse => ({
  blocks: [
    { text: "Connect an assistant", type: "header" },
    {
      text: "Claude, ChatGPT, and Codex can edit this website for you in a normal conversation, using the same tools as the assistant in the top bar. Each connects as you and has the same permissions as your account.",
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
            { alt: "Claude logo", type: "image", url: claudeLogo },
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
          label: "Claude",
        },
        {
          blocks: [
            { alt: "Claude logo", type: "image", url: claudeLogo },
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
        {
          blocks: [
            { alt: "OpenAI logo", type: "image", url: openaiLogo },
            {
              text: "1. In ChatGPT on the web, open Plugins. Select the plus button, then Add custom MCP server.",
              type: "section",
            },
            {
              text: "2. Name it after your website, paste the connection address above as the Server URL, and choose OAuth authentication.",
              type: "section",
            },
            {
              text: "3. Review the connection warning and select Create as a plugin. Sign in to this website when prompted and approve the connection. Install the plugin before using it.",
              type: "section",
            },
            {
              text: '4. In a conversation, type @ and select your website plugin. Try: "Show me the home page text" or "Save a draft with a shorter introduction".',
              type: "section",
            },
            {
              text: "If you cannot add a custom server, check your workspace permissions or ask your workspace admin.",
              type: "context",
            },
          ],
          label: "ChatGPT",
        },
        {
          blocks: [
            { alt: "OpenAI logo", type: "image", url: openaiLogo },
            {
              text: "1. With the Codex CLI installed, run these commands in a terminal:",
              type: "section",
            },
            {
              code: `codex mcp add website --url ${origin}${MCP_PATH}\ncodex mcp login website`,
              language: "bash",
              type: "code",
            },
            {
              text: "2. Follow the browser sign-in link, sign in to this website, and approve the connection.",
              type: "section",
            },
            {
              text: '3. Start a new Codex session and ask: "Use the website tools to show me the home page text" or "Save a draft with a shorter introduction".',
              type: "section",
            },
            {
              text: "In the Codex IDE extension, you can also open the gear menu, select MCP servers, then Add server. Choose Streamable HTTP, enter the address above, save, restart the extension, and select Authenticate.",
              type: "context",
            },
          ],
          label: "Codex",
        },
      ],
      type: "tab",
    },
    {
      description:
        "Ask your assistant to save drafts and review them here before you select Publish. To disconnect, remove the website connection in your assistant. In the Codex CLI, run: codex mcp remove website.",
      title: "Good to know",
      type: "banner",
    },
  ],
});
