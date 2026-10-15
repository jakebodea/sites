import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect } from "effect";

import type { StageSettings } from "./stage.ts";

/**
 * A full assistant request is several model calls (one per tool round), so this
 * allows a few requests a minute per site while stopping a stuck loop or a
 * runaway script from draining the account's daily Workers AI allowance.
 */
export const ASSISTANT_RATE_LIMIT = { interval: 600, limit: 120 } as const;

/**
 * The CMS assistant's model (`site-admin` plugin): Workers AI routed through a
 * per-stage AI Gateway (rate limit and request logs). Local dev has no Workers AI
 * emulation, so `bindModel` is false unless `AI_REMOTE=1` (the real model, no
 * gateway); without the binding the assistant answers offline.
 *
 * The site adds `AI: Cloudflare.Workers.AI()` itself when `bindModel` is true, the
 * same way it adds `EMAIL`: an optional key spread into the bindings fails Alchemy's types.
 */
export const assistantAi = (stage: StageSettings) =>
  Effect.gen(function* createAssistantAi() {
    const { dev } = yield* AlchemyContext;
    if (dev) {
      return { bindModel: process.env.AI_REMOTE === "1", gatewayId: "" };
    }
    const gateway = yield* Cloudflare.AI.Gateway("Assistant", {
      collectLogs: true,
      id: `${stage.workerName}-assistant`,
      rateLimitingInterval: ASSISTANT_RATE_LIMIT.interval,
      rateLimitingLimit: ASSISTANT_RATE_LIMIT.limit,
      rateLimitingTechnique: "sliding",
    });
    return { bindModel: true, gatewayId: gateway.gatewayId };
  });
