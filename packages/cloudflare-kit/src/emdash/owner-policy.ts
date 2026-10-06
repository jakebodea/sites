import { secureCompare } from "@emdash-cms/auth";
import { Schema } from "effect";

import { isEmailAddress } from "../server/contact.ts";

export const OWNER_BOOTSTRAP_PATH = "/_emdash/api/setup/owner";
export const BOOTSTRAP_HEADER = "x-cms-bootstrap-token";
export const EDITOR_ROLE = 40;
export const ADMIN_ROLE = 50;

export const OwnerConfig = Schema.Struct({
  CMS_BOOTSTRAP_TOKEN: Schema.String.check(Schema.isMinLength(32)),
  CMS_OWNER_EMAIL: Schema.String.check(
    Schema.makeFilter((email) =>
      isEmailAddress(email) ? undefined : "Invalid owner email"
    )
  ),
  CMS_OWNER_SITE: Schema.NonEmptyString,
  SITE_ORIGIN: Schema.NonEmptyString,
  STAGE: Schema.NonEmptyString,
});
export type OwnerConfig = typeof OwnerConfig.Type;
export const decodeOwnerConfig = Schema.decodeUnknownSync(OwnerConfig);

export class OwnershipError extends Schema.TaggedError<OwnershipError>()(
  "OwnershipError",
  { message: Schema.String }
) {}

export const ownershipDenied = (message: string, status = 403): Response =>
  Response.json(
    { error: { code: "CMS_OWNERSHIP_POLICY", message }, success: false },
    { headers: { "cache-control": "no-store" }, status }
  );

export const ownershipPath = (url: URL): string => {
  let { pathname } = url;
  while (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
};

export const isBootstrapAuthorized = (
  request: Request,
  config: OwnerConfig
): boolean =>
  secureCompare(
    request.headers.get(BOOTSTRAP_HEADER) ?? "",
    config.CMS_BOOTSTRAP_TOKEN
  );

export const earlyOwnershipGate = (
  request: Request,
  config: OwnerConfig,
  pathname: string = ownershipPath(new URL(request.url))
): Response | undefined => {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (pathname.startsWith("/_emdash/admin/setup")) {
    return Response.redirect(new URL("/_emdash/admin/login", request.url), 302);
  }
  const closedAuthPaths = [
    "signup",
    "oauth",
    "register",
    "dev-bypass",
    "dev-reset",
  ];
  if (
    closedAuthPaths.some((path) =>
      pathname.startsWith(`/_emdash/api/auth/${path}`)
    )
  ) {
    return ownershipDenied(
      "CMS accounts are created through Editor invitations."
    );
  }
  if (pathname.startsWith("/_emdash/api/setup")) {
    if (pathname === "/_emdash/api/setup/status" && !unsafe) {
      return undefined;
    }
    if (
      request.method === "POST" &&
      ["/_emdash/api/setup", OWNER_BOOTSTRAP_PATH].includes(pathname)
    ) {
      return isBootstrapAuthorized(request, config)
        ? undefined
        : ownershipDenied("CMS bootstrap requires the deploy credential.", 401);
    }
    return ownershipDenied("Public first-admin registration is disabled.");
  }
  return undefined;
};

export const accountMutationDenied = ({
  request,
  ownerEmail,
  targetEmail,
  body,
  pathname = ownershipPath(new URL(request.url)),
}: {
  readonly request: Request;
  readonly pathname?: string;
  readonly ownerEmail: string;
  readonly targetEmail: string;
  readonly body: { readonly email?: string; readonly role?: number };
}): Response | undefined => {
  const owner = targetEmail.toLowerCase() === ownerEmail.toLowerCase();
  if (owner && (request.method === "DELETE" || pathname.endsWith("/disable"))) {
    return ownershipDenied(
      "The studio owner account cannot be deleted or disabled."
    );
  }
  const changesOwnerEmail =
    body.email !== undefined &&
    body.email.toLowerCase() !== ownerEmail.toLowerCase();
  const changesOwnerRole = body.role !== undefined && body.role !== ADMIN_ROLE;
  if (owner && (changesOwnerEmail || changesOwnerRole)) {
    return ownershipDenied(
      "Change the studio owner identity through a reviewed migration."
    );
  }
  if (!owner && body.role !== undefined && body.role > EDITOR_ROLE) {
    return ownershipDenied("Client accounts cannot be promoted above Editor.");
  }
  if (!owner && body.email?.toLowerCase() === ownerEmail.toLowerCase()) {
    return ownershipDenied("The studio owner email is reserved.");
  }
  return undefined;
};
