import type { LeadMailEnv } from "../env.ts";
import type { StageSettings } from "./stage.ts";

export const leadMail = (
  stage: StageSettings,
  routes: {
    readonly emailFrom: string | undefined;
    readonly inbox: string | null;
    readonly fromName: string;
    readonly alertInbox: string;
  }
) =>
  ({
    ALERT_EMAIL: stage.production ? routes.alertInbox : "",
    LEAD_NOTIFY_FROM: routes.emailFrom ?? "",
    LEAD_NOTIFY_FROM_NAME: routes.fromName,
    LEAD_NOTIFY_TO: routes.inbox ?? "",
  }) satisfies Record<keyof LeadMailEnv, string>;
