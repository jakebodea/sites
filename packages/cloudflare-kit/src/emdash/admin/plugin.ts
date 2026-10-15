// oxlint-disable-next-line typescript/triple-slash-reference -- ambient `cloudflare:workers` types for node-side tsconfigs (astro.config) that import this plugin.
/// <reference path="../cloudflare-workers.d.ts" />
/**
 * The `site-admin` EmDash plugin: a "Start here" dashboard card, the Assistant
 * page, an Assistant panel on every entry's editor, and the "Use with Claude"
 * page. All UI is Block Kit; the assistant runs on the server (see `assistant/`).
 */
import type { Block } from "@emdash-cms/blocks";
import { Option, Predicate } from "effect";
import type { PluginDescriptor, RouteContext } from "emdash";
import { definePlugin } from "emdash";

import { runAgent } from "./assistant/agent.ts";
import { connectEmDashMcp } from "./assistant/mcp.ts";
import { offlineAdapter, workersAiAdapter } from "./assistant/model.ts";
import type { WorkersAiBinding } from "./assistant/model.ts";
import { describePhotoTool } from "./assistant/photo.ts";
import {
  freeformPrompt,
  presetPrompt,
  systemPrompt,
} from "./assistant/prompts.ts";
import type { EntryRef } from "./assistant/prompts.ts";
import { decodeInteraction } from "./interactions.ts";
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_GUIDE,
  DEFAULT_PRESETS,
  SITE_ADMIN_PLUGIN_ID,
} from "./options.ts";
import type { CmsAdminOptions } from "./options.ts";
import { currentRequestScope } from "./request-scope.ts";
import {
  assistantPage,
  claudePage,
  editorPanel,
  errorBlocks,
  resultBlocks,
  startHereWidget,
} from "./ui.ts";

const VERSION = "1.0.0";

/** Plugin options travel through EmDash's virtual module, so they are plain JSON. */
export type SiteAdminPluginOptions = Pick<
  CmsAdminOptions,
  "assistant" | "guide" | "siteName"
>;

/** The Workers AI binding from `assistantAi` in the kit's infra; absent in offline local dev. */
const isWorkersAi = (value: unknown): value is WorkersAiBinding =>
  Predicate.hasProperty(value, "run") && Predicate.isFunction(value.run);

const createAssistant = (options: SiteAdminPluginOptions) => {
  const assistant =
    options.assistant === false ? undefined : (options.assistant ?? {});
  const presets = assistant?.presets ?? DEFAULT_PRESETS;
  const locales = assistant?.locales ?? [];

  const run = async (
    ctx: RouteContext,
    prompt: string,
    entry?: EntryRef
  ): Promise<Block[]> => {
    const scope = currentRequestScope();
    if (scope === undefined) {
      return errorBlocks(
        "The assistant is not set up on this site (missing the cmsAdmin integration)."
      );
    }
    const { env } = await import("cloudflare:workers");
    const binding =
      Predicate.hasProperty(env, "AI") && isWorkersAi(env.AI)
        ? env.AI
        : undefined;
    const gatewayId =
      Predicate.hasProperty(env, "AI_GATEWAY_ID") &&
      Predicate.isString(env.AI_GATEWAY_ID)
        ? env.AI_GATEWAY_ID
        : "";
    const adapter =
      binding === undefined
        ? offlineAdapter(entry?.collection ?? "pages")
        : workersAiAdapter({
            binding,
            gatewayId,
            model: assistant?.model ?? DEFAULT_ASSISTANT_MODEL,
          });
    const { media } = ctx;
    const extraTools =
      presets.includes("alt-text") && media?.readBytes !== undefined
        ? [
            describePhotoTool(async (id) => {
              const item = await media.get(id);
              return item === null
                ? null
                : ((await media.readBytes?.(id)) ?? null);
            }, adapter),
          ]
        : [];
    const mcp = await connectEmDashMcp(scope);
    try {
      return resultBlocks(
        await runAgent({
          adapter,
          extraTools,
          mcp,
          prompt,
          system: systemPrompt(options.siteName),
        })
      );
    } catch (error) {
      ctx.log.error("assistant run failed", { error: String(error) });
      return errorBlocks(
        "Something went wrong while talking to the AI model. Nothing was changed after the error; try again in a minute, or with a smaller request."
      );
    } finally {
      await mcp.close();
    }
  };

  /** Dashboard widget and admin pages (`page_load`, `form_submit`). */
  const admin = async (ctx: RouteContext) => {
    const { origin } = new URL(ctx.request.url);
    const interaction = Option.getOrUndefined(decodeInteraction(ctx.input));
    if (interaction?.type === "page_load") {
      if (interaction.page === "widget:start") {
        return startHereWidget(options.guide ?? DEFAULT_GUIDE);
      }
      return interaction.page === "/claude"
        ? claudePage(origin)
        : assistantPage();
    }
    if (interaction?.type === "form_submit") {
      return {
        ...assistantPage(
          await run(ctx, freeformPrompt(interaction.values.request))
        ),
        toast: { message: "The assistant finished", type: "info" as const },
      };
    }
    return assistantPage();
  };

  /** The editor's Assistant panel; reloads the entry after a run so the draft shows. */
  const panel = async (ctx: RouteContext) => {
    const entry = ctx.ui?.entry;
    const interaction = Option.getOrUndefined(decodeInteraction(ctx.input));
    if (entry === undefined || interaction === undefined) {
      return editorPanel(presets);
    }
    const target: EntryRef = {
      collection: entry.collection,
      id: entry.id,
      locale: entry.locale,
    };
    let prompt: string | undefined;
    if (interaction.type === "block_action") {
      prompt = presetPrompt(interaction.value, target, locales);
    } else if (interaction.type === "form_submit") {
      prompt = freeformPrompt(interaction.values.request, target);
    }
    if (prompt === undefined) {
      return editorPanel(presets);
    }
    return {
      ...editorPanel(presets, await run(ctx, prompt, target)),
      refresh: true as const,
    };
  };

  return { admin, assistant, panel };
};

/** Entry point EmDash's integration bundles; use {@link siteAdminPlugin} in astro config. */
export const createPlugin = (options: SiteAdminPluginOptions) => {
  const { admin, assistant, panel } = createAssistant(options);
  return definePlugin({
    admin: {
      editorPanels:
        assistant === undefined
          ? []
          : [
              {
                id: "assistant",
                route: "panel",
                title: "Assistant",
                ...(assistant.collections !== undefined && {
                  collections: [...assistant.collections],
                }),
              },
            ],
      pages:
        assistant === undefined
          ? []
          : [
              { icon: "sparkle", label: "Assistant", path: "/assistant" },
              { icon: "plug", label: "Use with Claude", path: "/claude" },
            ],
      widgets: [{ id: "start", size: "full", title: "Start here" }],
    },
    capabilities: ["media:read", "media:bytes:read"],
    id: SITE_ADMIN_PLUGIN_ID,
    routes: {
      admin: { handler: admin, permission: "plugins:read" },
      panel: { handler: panel, permission: "content:edit_own" },
    },
    version: VERSION,
  });
};

export default createPlugin;

/** Descriptor for `emdash({ plugins: [siteAdminPlugin(cmsAdmin)] })`. */
export const siteAdminPlugin = (options: CmsAdminOptions): PluginDescriptor => {
  const pluginOptions: SiteAdminPluginOptions = {
    assistant: options.assistant ?? {},
    guide: options.guide ?? DEFAULT_GUIDE,
    siteName: options.siteName,
  };
  return {
    capabilities: ["media:read", "media:bytes:read"],
    entrypoint: "@jakebodea/cloudflare-kit/emdash/admin/plugin",
    format: "native",
    id: SITE_ADMIN_PLUGIN_ID,
    options: pluginOptions,
    version: VERSION,
  };
};
