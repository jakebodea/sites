import type { APIRoute } from "astro";

import { adminAliasTarget } from "./admin-alias.ts";

export const prerender = false;
// 302, not 301: browsers cache permanent redirects, which would pin the target.
const redirectToAdmin: APIRoute = ({ url }) =>
  Response.redirect(adminAliasTarget(url), 302);

export const GET = redirectToAdmin;
