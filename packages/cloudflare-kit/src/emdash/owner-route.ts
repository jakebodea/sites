import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  OwnershipError,
  decodeOwnerConfig,
  isBootstrapAuthorized,
  ownershipDenied,
} from "./owner-policy.ts";
import { provisionOwner } from "./owner.ts";

export const prerender = false;
const handleOwnerBootstrap: APIRoute = async function handleOwnerBootstrap({
  request,
  locals,
}) {
  try {
    const config = decodeOwnerConfig(env);
    if (!isBootstrapAuthorized(request, config)) {
      return ownershipDenied(
        "CMS bootstrap requires the deploy credential.",
        401
      );
    }
    return Response.json(
      { data: await provisionOwner(locals.emdash.db, config), success: true },
      {
        headers: { "cache-control": "no-store" },
      }
    );
  } catch (error) {
    return ownershipDenied(
      error instanceof OwnershipError
        ? error.message
        : "CMS owner provisioning failed.",
      error instanceof OwnershipError ? 409 : 503
    );
  }
};

export const POST = handleOwnerBootstrap;
