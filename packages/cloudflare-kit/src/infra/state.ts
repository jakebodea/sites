import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State";
import { Effect, Layer, Option } from "effect";

import { stageKind } from "./stage.ts";

/**
 * Where a site stack keeps its Alchemy state. A `dev-<worktree>` stage run
 * under `alchemy dev` has only emulated resources, so its state stays in the
 * worktree's `.alchemy/state`: the remote store cost ~4 s of network on every
 * dev boot. Everything else, including a `dev-*` name passed to
 * `alchemy deploy`, uses the account's Cloudflare state store.
 */
export const siteState = () =>
  Layer.unwrap(
    Effect.gen(function* resolveState() {
      const stage = yield* Alchemy.Stage;
      const context = yield* Effect.serviceOption(AlchemyContext);
      const dev = Option.isSome(context) && context.value.dev;
      return dev && stageKind(stage) === "development"
        ? localState()
        : Cloudflare.state();
    })
  );
