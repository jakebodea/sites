import { validateInvite } from "@emdash-cms/auth";
import { createKyselyAdapter } from "@emdash-cms/auth/adapters/kysely";
import type { APIContext } from "astro";
import { defineMiddleware } from "astro/middleware";
import { env } from "cloudflare:workers";
import { Schema } from "effect";
import { UserRepository } from "emdash";

import {
  ADMIN_ROLE,
  EDITOR_ROLE,
  accountMutationDenied,
  decodeOwnerConfig,
  ownershipDenied,
  ownershipPath,
} from "./owner-policy.ts";
import { isProvisionedOwner } from "./owner.ts";

const InviteBody = Schema.Struct({
  email: Schema.String,
  role: Schema.optionalKey(Schema.Number),
});
const MutationBody = Schema.Struct({
  email: Schema.optionalKey(Schema.String),
  role: Schema.optionalKey(Schema.Number),
});
const TokenBody = Schema.Struct({ token: Schema.String });
const USER_PATH =
  /^\/_emdash\/api\/admin\/users\/(?<id>[^/]+)(?:\/(?<action>disable|enable|send-recovery))?$/u;
const INVITE_REDEMPTION = new Set([
  "/_emdash/api/auth/invite/accept",
  "/_emdash/api/auth/invite/register-options",
  "/_emdash/api/auth/invite/complete",
]);

const invitationPolicy = async (
  context: APIContext,
  ownerEmail: string
): Promise<Response | undefined> => {
  const { request, locals } = context;
  const pathname = ownershipPath(context.url);
  if (pathname === "/_emdash/api/auth/invite" && request.method === "POST") {
    if (
      locals.user?.email.toLowerCase() !== ownerEmail ||
      locals.user.role !== ADMIN_ROLE
    ) {
      return ownershipDenied("Only the studio owner can invite clients.");
    }
    const body = Schema.decodeUnknownSync(InviteBody)(
      await request.clone().json()
    );
    if (body.role !== EDITOR_ROLE || body.email.toLowerCase() === ownerEmail) {
      return ownershipDenied(
        "Invite clients with the Editor role; the owner email is reserved."
      );
    }
  }
  if (
    INVITE_REDEMPTION.has(pathname) &&
    ["GET", "POST"].includes(request.method)
  ) {
    const token =
      request.method === "GET"
        ? (context.url.searchParams.get("token") ?? "")
        : Schema.decodeUnknownSync(TokenBody)(await request.clone().json())
            .token;
    const invite = await validateInvite(
      createKyselyAdapter(locals.emdash.db),
      token
    );
    if (
      invite.role !== EDITOR_ROLE ||
      invite.email.toLowerCase() === ownerEmail
    ) {
      return ownershipDenied(
        "This invitation does not grant permitted client access."
      );
    }
  }
  return undefined;
};

const userMutationPolicy = async (
  context: APIContext,
  ownerEmail: string
): Promise<Response | undefined> => {
  const { request, locals } = context;
  const pathname = ownershipPath(context.url);
  const targetId = USER_PATH.test(pathname) ? context.params.id : undefined;
  if (
    targetId === undefined ||
    !["PUT", "PATCH", "POST", "DELETE"].includes(request.method)
  ) {
    return undefined;
  }
  const target = await new UserRepository(locals.emdash.db).findById(targetId);
  if (target === null) {
    return undefined;
  }
  const body = ["PUT", "PATCH"].includes(request.method)
    ? Schema.decodeUnknownSync(MutationBody)(await request.clone().json())
    : {};
  return accountMutationDenied({
    body,
    ownerEmail,
    pathname,
    request,
    targetEmail: target.email,
  });
};

export const onRequest = defineMiddleware(async (context, next) => {
  if (
    import.meta.env.DEV ||
    !ownershipPath(context.url).startsWith("/_emdash/")
  ) {
    return await next();
  }
  const config = decodeOwnerConfig(env);
  const ownerEmail = config.CMS_OWNER_EMAIL.toLowerCase();
  const { user } = context.locals;
  if (
    user !== undefined &&
    user.role >= ADMIN_ROLE &&
    (user.email.toLowerCase() !== ownerEmail ||
      !(await isProvisionedOwner(context.locals.emdash.db, config, user.id)))
  ) {
    return ownershipDenied(
      "Only the configured studio owner can administer this CMS."
    );
  }
  let denied: Response | undefined;
  try {
    denied =
      (await invitationPolicy(context, ownerEmail)) ??
      (await userMutationPolicy(context, ownerEmail));
  } catch {
    return ownershipDenied("Invalid CMS account request.", 400);
  }
  return denied ?? (await next());
});
