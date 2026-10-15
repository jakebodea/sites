/**
 * The site-admin plugin's admin bundle (`adminEntry`). EmDash bundles it into
 * the admin app, which renders client-side only; it mounts the Assistant in a
 * root of its own beside the admin, since the admin has no header slot.
 */
import "#assistant/assistant.css";
import { createRoot } from "react-dom/client";
import cmsAdmin from "virtual:cms-admin-config";

import { Assistant } from "#assistant/assistant.tsx";

import { DEFAULT_PRESETS } from "../options.ts";

const ROOT_ID = "site-assistant";

if (typeof document !== "undefined" && cmsAdmin.assistant !== false) {
  const { assistant } = cmsAdmin;
  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.body.append(host);
  createRoot(host).render(
    <Assistant
      config={{
        collections: assistant.collections,
        presets: assistant.presets ?? DEFAULT_PRESETS,
        siteName: cmsAdmin.siteName,
      }}
      host={host}
    />
  );
}

/** EmDash reads plugin pages, widgets and fields from here; this plugin's are Block Kit. */
export const pages = {};
