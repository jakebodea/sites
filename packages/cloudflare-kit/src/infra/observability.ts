/**
 * Native Workers Logs and traces, on for every stage. Client sites have no
 * separate log platform: failed leads alert through PostHog (`lead submit
 * failed`), and everything else is debugged from Workers Logs.
 */
import type { StageSettings } from "./stage.ts";

/** Logs on everywhere; traces sampled on prod. */
export const siteObservability = (settings: StageSettings) => ({
  enabled: true,
  logs: {
    enabled: true,
    headSamplingRate: 1,
    invocationLogs: true,
    persist: true,
  },
  traces: {
    enabled: true,
    headSamplingRate: settings.production ? 0.1 : 1,
    persist: true,
  },
});
