import type { Redacted } from "effect";
import { Config, Effect, Option } from "effect";

import type { LeadMailEnv } from "../env.ts";
import type { StageSettings } from "./stage.ts";

export const leadMail = (stage: StageSettings, emailFrom: string | undefined) =>
  Effect.gen(function* resolveLeadMail() {
    const inbox = yield* Config.String("LEAD_NOTIFY_TO").pipe(Config.option);
    const alert = stage.production
      ? yield* Config.Redacted("ALERT_EMAIL").pipe(Config.option)
      : Option.none();
    return {
      ALERT_EMAIL: Option.getOrElse(alert, () => ""),
      LEAD_NOTIFY_FROM: emailFrom ?? "",
      LEAD_NOTIFY_TO: Option.getOrElse(inbox, () => ""),
    } satisfies Record<keyof LeadMailEnv, string | Redacted.Redacted>;
  });
