import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State";
import { Effect, Layer } from "effect";

import { stageKind } from "./stage.ts";

/**
 * Where a site stack keeps its Alchemy state. Deployed stages use the account's
 * Cloudflare state store. A `dev-<worktree>` stage only ever runs under
 * `alchemy dev` with emulated resources, so its state stays in the worktree's
 * `.alchemy/state`: the remote store cost ~4 s of network on every dev boot.
 */
export const siteState = () =>
  Layer.unwrap(
    Alchemy.Stage.pipe(
      Effect.map((stage) =>
        stageKind(stage) === "development" ? localState() : Cloudflare.state()
      )
    )
  );
