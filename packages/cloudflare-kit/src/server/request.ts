/**
 * A request runner that releases the request's layer in `waitUntil`, so
 * finalizers (and anything they flush) never delay the response.
 */
import type { Exit } from "effect";
import { Effect, Layer, Scope } from "effect";

/**
 * Runs a request-scoped program with its layer. The layer is built in a scope
 * that closes in `waitUntil` after the result is returned.
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
