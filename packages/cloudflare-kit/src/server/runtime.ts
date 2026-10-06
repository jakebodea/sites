import { Context } from "effect";

/**
 * Keeps the Worker alive for background work after the response is sent
 * (`ExecutionContext.waitUntil`). Provided per request by the site.
 */
export class WaitUntil extends Context.Service<
  WaitUntil,
  (promise: Promise<unknown>) => void
>()("@jakebodea/cloudflare-kit/WaitUntil") {}
