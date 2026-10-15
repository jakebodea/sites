/**
 * What the admin panel and the chat route agree on. Plain data only: the panel
 * imports this, and islands never load Effect.
 */
import type { AssistantPreset } from "../options.ts";

/** The streaming chat endpoint. Under `/_emdash/api`, so EmDash requires a session and its CSRF header. */
export const CHAT_PATH = "/_emdash/api/site-admin/assistant";

/** EmDash's CSRF guard for cookie-authenticated API writes. */
export const CSRF_HEADERS = { "X-EmDash-Request": "1" } as const;

export const PRESET_LABELS: Record<AssistantPreset, string> = {
  "alt-text": "Describe the photos",
  polish: "Polish the wording",
  seo: "Suggest search details",
  translate: "Translate",
};

/** The entry open in the editor, read from the admin URL. */
export interface OpenEntry {
  readonly collection: string;
  readonly id: string;
}

/** Sent as `forwardedProps` with each turn (the `body` option of `useChat`). */
export interface TurnContext {
  readonly entry?: OpenEntry;
  readonly preset?: AssistantPreset;
}

/** What the panel needs from the site's `cms.config.ts`, delivered through `virtual:cms-admin-config`. */
export interface PanelConfig {
  readonly siteName: string;
  readonly presets: readonly AssistantPreset[];
  readonly collections?: readonly string[];
}
