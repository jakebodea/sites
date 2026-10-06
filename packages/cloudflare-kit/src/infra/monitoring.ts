/**
 * Prod-only monitoring in Axiom, provisioned by Alchemy's Axiom provider:
 *
 * - Workers Logs are exported to an Axiom logs dataset (every request,
 *   including errors thrown by Astro/EmDash rendering).
 * - Server Effect programs export OTLP traces and logs (`AxiomTelemetry`).
 * - Monitors email `ALERT_EMAIL` on server errors and failed lead submissions.
 *
 * With no `AXIOM_TOKEN` in the deploy environment, or on any stage but prod,
 * nothing is created and the Worker gets empty settings (telemetry no-ops).
 * Native Workers Logs/traces stay on for every stage either way.
 */
import * as Axiom from "alchemy/Axiom";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { Stage } from "alchemy/Stage";
import { Config, Effect, Layer, Option, Redacted } from "effect";

import { LEAD_SUBMIT_FAILED } from "../server/contact.ts";
import type { StageSettings } from "./stage.ts";

const DISABLED_ENV = {
  AXIOM_INGEST_TOKEN: "",
  AXIOM_LOGS_DATASET: "",
  AXIOM_LOGS_URL: "",
  AXIOM_TRACES_DATASET: "",
  AXIOM_TRACES_URL: "",
} as const;

/** Native Workers observability: logs and traces on everywhere, traces sampled on prod. */
const workerObservability = (
  settings: StageSettings,
  logDestinations?: Output.Output<string>[]
) => ({
  enabled: true,
  logs: {
    destinations: logDestinations,
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

/**
 * Axiom's provider resolves credentials eagerly, so it is only loaded when
 * monitoring will actually be provisioned (prod with `AXIOM_TOKEN`). Every
 * other stage, including `alchemy dev`, needs no Axiom account.
 */
export const monitoringProviders = () =>
  Layer.unwrap(
    Effect.gen(function* monitoringProvidersGen() {
      const stage = yield* Stage;
      const token = yield* Config.String("AXIOM_TOKEN").pipe(
        Config.option,
        Effect.orElseSucceed(() => Option.none())
      );
      return stage === "prod" && Option.isSome(token)
        ? Axiom.providers()
        : Layer.empty;
    })
  );

export const siteMonitoring = Effect.fn("siteMonitoring")(
  function* siteMonitoring(settings: StageSettings) {
    const deployToken = yield* Config.String("AXIOM_TOKEN").pipe(Config.option);
    if (!settings.production || Option.isNone(deployToken)) {
      return {
        env: DISABLED_ENV,
        observability: workerObservability(settings),
      };
    }
    const alertEmail = yield* Config.String("ALERT_EMAIL");
    const name = settings.workerName;
    const logs = yield* Axiom.Dataset("AxiomLogs", {
      description: `${name}: Workers Logs and application logs.`,
      kind: "otel:logs:v1",
      name: `${name}-logs`,
      retentionDays: 30,
      useRetentionPeriod: true,
    });
    const traces = yield* Axiom.Dataset("AxiomTraces", {
      description: `${name}: server traces.`,
      kind: "otel:traces:v1",
      name: `${name}-traces`,
      retentionDays: 30,
      useRetentionPeriod: true,
    });
    const ingest = yield* Axiom.ApiToken("AxiomIngest", {
      datasetCapabilities: Output.all(logs.name, traces.name).pipe(
        Output.map(([logsName, tracesName]) => ({
          [logsName]: { ingest: ["create" as const] },
          [tracesName]: { ingest: ["create" as const] },
        }))
      ),
      description: "Owned by Alchemy: OTLP ingest for the site Worker.",
      name: `${name}-ingest`,
    });
    const bearer = ingest.token.pipe(
      Output.map((token) => `Bearer ${Redacted.value(token)}`)
    );
    const workerLogs = yield* Cloudflare.Workers.ObservabilityDestination(
      "AxiomWorkerLogs",
      {
        headers: {
          authorization: bearer,
          "x-axiom-dataset": logs.name,
        },
        logpushDataset: "opentelemetry-logs",
        name: `${name}-axiom-logs`,
        url: logs.otelLogsEndpoint,
      }
    );
    const notifier = yield* Axiom.Notifier("AlertEmail", {
      name: `${name} alerts`,
      properties: { email: { emails: [alertEmail] } },
    });
    // Field names follow Axiom's OTLP log mapping; confirm them against the first real events.
    yield* Axiom.Monitor("ServerErrors", {
      alertOnNoData: false,
      aplQuery: logs.name.pipe(
        Output.map(
          (dataset) =>
            `['${dataset}'] | where severity_text in ("ERROR", "FATAL") or ['attributes.outcome'] == "exception" | summarize count()`
        )
      ),
      description: "Uncaught exceptions or error logs from the site Worker.",
      intervalMinutes: 5,
      name: `${name}: server errors`,
      notifierIds: [notifier.id],
      operator: "Above",
      rangeMinutes: 5,
      resolvable: true,
      threshold: 0,
      type: "Threshold",
    });
    yield* Axiom.Monitor("LeadSubmitFailed", {
      aplQuery: logs.name.pipe(
        Output.map(
          (dataset) =>
            `['${dataset}'] | where body contains "${LEAD_SUBMIT_FAILED}"`
        )
      ),
      description: "A visitor's contact form submission could not be saved.",
      intervalMinutes: 5,
      name: `${name}: lead submit failed`,
      notifierIds: [notifier.id],
      rangeMinutes: 5,
      type: "MatchEvent",
    });
    return {
      env: {
        AXIOM_INGEST_TOKEN: ingest.token,
        AXIOM_LOGS_DATASET: logs.name,
        AXIOM_LOGS_URL: logs.otelLogsEndpoint,
        AXIOM_TRACES_DATASET: traces.name,
        AXIOM_TRACES_URL: traces.otelTracesEndpoint,
      },
      observability: workerObservability(settings, [workerLogs.slug]),
    };
  }
);
