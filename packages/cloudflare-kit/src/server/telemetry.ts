/**
 * Effect OTLP export to Axiom (traces + logs) for server programs, and a
 * request runner that flushes telemetry in `waitUntil` so exporting never
 * delays a response. Without `AXIOM_INGEST_TOKEN` the layer is empty and
 * programs only log to Workers Logs.
 */
import type { Exit } from "effect";
import { Config, Effect, Layer, Option, Redacted, Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  OtlpLogger,
  OtlpSerialization,
  OtlpTracer,
} from "effect/observability";

export interface TelemetryResource {
  /** Logical service name, e.g. the site id. */
  readonly serviceName: string;
  /** Deployment stage, e.g. `prod`. */
  readonly environment: string;
}

/**
 * Reads `AXIOM_INGEST_TOKEN`, `AXIOM_TRACES_URL`, `AXIOM_TRACES_DATASET`,
 * `AXIOM_LOGS_URL`, and `AXIOM_LOGS_DATASET` (bound by `siteMonitoring` on prod).
 */
const otlpResource = (resource: TelemetryResource) => ({
  attributes: { "deployment.environment.name": resource.environment },
  serviceName: resource.serviceName,
});

// oxlint-disable-next-line sonarjs/function-name -- Effect Layers are PascalCase values by convention.
export const AxiomTelemetry = (resource: TelemetryResource) =>
  Layer.unwrap(
    Effect.gen(function* axiomTelemetry() {
      const token = yield* Config.Redacted("AXIOM_INGEST_TOKEN").pipe(
        Config.option,
        Effect.map(Option.filter((value) => Redacted.value(value) !== ""))
      );
      if (Option.isNone(token)) {
        return Layer.empty;
      }
      const tracesUrl = yield* Config.String("AXIOM_TRACES_URL");
      const tracesDataset = yield* Config.String("AXIOM_TRACES_DATASET");
      const logsUrl = yield* Config.String("AXIOM_LOGS_URL");
      const logsDataset = yield* Config.String("AXIOM_LOGS_DATASET");
      const authorization = `Bearer ${Redacted.value(token.value)}`;
      return Layer.mergeAll(
        OtlpTracer.layer({
          headers: { authorization, "x-axiom-dataset": tracesDataset },
          resource: otlpResource(resource),
          url: tracesUrl,
        }),
        OtlpLogger.layer({
          headers: { authorization, "x-axiom-dataset": logsDataset },
          mergeWithExisting: true,
          resource: otlpResource(resource),
          url: logsUrl,
        })
      ).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provide(FetchHttpClient.layer)
      );
    })
  );

/**
 * Runs a request-scoped program with its layer. The layer is built in a scope
 * that closes in `waitUntil` after the result is returned, so telemetry
 * exporters flush off the response path.
 */
export const runRequest = async <A, E, R, LE>(
  program: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R, LE>,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<Exit.Exit<A, E | LE>> => {
  const scope = Scope.makeUnsafe();
  const exit = await Effect.runPromiseExit(
    Layer.buildWithScope(layer, scope).pipe(
      Effect.flatMap((context) => Effect.provide(program, context))
    )
  );
  waitUntil(Effect.runPromise(Scope.close(scope, exit)));
  return exit;
};
