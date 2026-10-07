/* oxlint-disable typescript/triple-slash-reference -- Ambient virtual-module types must be included by consuming Astro projects. */
/// <reference path="./published-virtual.d.ts" />
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getDb } from "emdash/runtime";
import plan from "virtual:published-content";

import { ownershipDenied } from "./owner-policy.ts";
import {
  authorizedContentRequest,
  completeFresh,
  PublishedContentError,
} from "./published-content.ts";
import { decodeContentBindings } from "./published-env.ts";

const handleRequest: APIRoute = async function handleRequest({
  request,
  locals,
}) {
  const bindings = decodeContentBindings(env);
  if (!authorizedContentRequest(request, bindings, "complete")) {
    return ownershipDenied(
      "Fresh content completion requires dev/pr and the destination bootstrap credential",
      401
    );
  }
  if (new URL(request.url).search !== "" || (await request.text()) !== "") {
    return ownershipDenied(
      "Completion accepts no client bundle, source, destination or site",
      400
    );
  }
  if (plan === null) {
    return ownershipDenied("Requested production content plan is missing", 409);
  }
  try {
    return Response.json(
      await completeFresh(
        await getDb(),
        plan,
        bindings.STAGE ?? "",
        bindings.CMS_OWNER_SITE ?? "",
        locals.emdash.storage
      ),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return ownershipDenied(
      error instanceof PublishedContentError
        ? error.message
        : "Native published content completion failed",
      409
    );
  }
};

export const POST = handleRequest;
