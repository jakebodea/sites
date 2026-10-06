import { defineMiddleware } from "astro/middleware";
import { env } from "cloudflare:workers";

import {
  decodeOwnerConfig,
  earlyOwnershipGate,
  ownershipDenied,
  ownershipPath,
} from "./owner-policy.ts";

export const onRequest = defineMiddleware(async (context, next) => {
  if (import.meta.env.DEV) {
    return await next();
  }
  let pathname: string;
  try {
    pathname = ownershipPath(context.url);
  } catch {
    return ownershipDenied("Invalid CMS request path.", 400);
  }
  if (!pathname.startsWith("/_emdash/")) {
    return await next();
  }
  let denied: Response | undefined;
  try {
    denied = earlyOwnershipGate(
      context.request,
      decodeOwnerConfig(env),
      pathname
    );
  } catch {
    return ownershipDenied("CMS ownership configuration is unavailable.", 503);
  }
  return denied ?? (await next());
});
