import { useSyncExternalStore } from "react";

/**
 * The admin is a single-page app (TanStack Router), so the path changes
 * without a page load. The Navigation API reports every in-app navigation;
 * `popstate` covers back and forward where it is missing.
 */
const subscribe = (onChange: () => void) => {
  // Missing in Firefox before 147; `popstate` alone still catches back and forward.
  const navigation =
    "navigation" in globalThis ? globalThis.navigation : undefined;
  navigation?.addEventListener("currententrychange", onChange);
  globalThis.addEventListener("popstate", onChange);
  return () => {
    navigation?.removeEventListener("currententrychange", onChange);
    globalThis.removeEventListener("popstate", onChange);
  };
};

export const usePathname = (): string =>
  useSyncExternalStore(subscribe, () => globalThis.location.pathname);
