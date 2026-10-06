/** Workers Logs and traces on every stage; contact failures also email the configured alert route. */
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
