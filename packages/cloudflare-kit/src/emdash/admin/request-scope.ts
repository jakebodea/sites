/**
 * EmDash hands plugin routes a `request` and `user` but not Astro's context,
 * whose `locals` EmDash's own MCP handler needs (runtime, user, token scopes).
 * The admin middleware runs the assistant's routes inside this scope so the
 * plugin can call that handler in-process as the signed-in editor.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { APIContext } from "astro";

declare global {
  // One store even when the bundler splits this module across chunks (EmDash does the same).
  // oxlint-disable-next-line no-var -- a global declaration must use `var`.
  var siteAdminRequestScope: AsyncLocalStorage<APIContext> | undefined;
}

globalThis.siteAdminRequestScope ??= new AsyncLocalStorage<APIContext>();
const store = globalThis.siteAdminRequestScope;

export const runInRequestScope = <T>(context: APIContext, run: () => T): T =>
  store.run(context, run);

export const currentRequestScope = (): APIContext | undefined =>
  store.getStore();
