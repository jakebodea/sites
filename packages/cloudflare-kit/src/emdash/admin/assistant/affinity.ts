// oxlint-disable anti-slop/no-reflect-get, anti-slop/no-reflect-apply, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, typescript/no-unsafe-return -- env.AI's run has generic overloads per model that cannot be named or re-declared; this Proxy forwards every member untouched and only adds a header to run's options.
/**
 * Sends every model call of one conversation with the same `x-session-affinity`,
 * so Workers AI routes them to the same instance and reuses the cached prompt
 * prefix (system prompt, skills catalog, tools, earlier turns): cached input
 * costs about a fifth. TanStack's adapter passes no headers to the binding, so
 * its `run` is wrapped to add the header to the options it already sends.
 */
export const SESSION_AFFINITY_HEADER = "x-session-affinity";

export const withSessionAffinity = <Binding extends object>(
  binding: Binding,
  session: string
): Binding =>
  new Proxy(binding, {
    get: (target, property, receiver) => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== "run" || typeof value !== "function") {
        return value;
      }
      return async (model: string, inputs: object, options?: AiOptions) =>
        await Reflect.apply(value, target, [
          model,
          inputs,
          {
            ...options,
            extraHeaders: {
              ...options?.extraHeaders,
              [SESSION_AFFINITY_HEADER]: session,
            },
          },
        ]);
    },
  });

/** One id per editor and conversation; the first message's id holds for the whole conversation. */
export const conversationSession = (
  userId: string | undefined,
  firstMessageId: string | undefined,
  threadId: string
): string => `${userId ?? "editor"}:${firstMessageId ?? threadId}`;
