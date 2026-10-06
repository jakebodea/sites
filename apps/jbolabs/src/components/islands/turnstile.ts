/** Loads Cloudflare Turnstile on demand and renders a widget into an element. */

interface TurnstileApi {
  readonly render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      size: "flexible";
      theme: "light";
    }
  ) => string;
  readonly remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | undefined;

const injectScript = async (): Promise<TurnstileApi> => {
  const { promise, reject, resolve } = Promise.withResolvers<TurnstileApi>();
  const script = document.createElement("script");
  script.src = SCRIPT_URL;
  script.async = true;
  script.addEventListener("load", () => {
    if (window.turnstile === undefined) {
      reject(new Error("Turnstile did not initialize"));
    } else {
      resolve(window.turnstile);
    }
  });
  script.addEventListener("error", () => {
    reject(new Error("Turnstile failed to load"));
  });
  // oxlint-disable-next-line unicorn/prefer-modern-dom-apis -- `append` is shadowed by workers-types' HTMLRewriter Element in this shared tsconfig.
  document.head.insertAdjacentElement("beforeend", script);
  return await promise;
};

export const loadTurnstile = async (): Promise<TurnstileApi> => {
  loading ??= injectScript();
  return await loading;
};
