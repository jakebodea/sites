import { useEffect, useState } from "react";

import { loadTurnstile } from "../turnstile";

/**
 * Renders a Turnstile widget into the element given to `ref` while `active`,
 * and reports its token ("" until solved or after it expires) and whether the
 * script failed to load.
 */
export const useTurnstile = ({
  active,
  locale,
  siteKey,
}: {
  readonly active: boolean;
  readonly locale: string;
  readonly siteKey: string;
}) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    const clear = () => {
      setToken("");
    };
    const mount = async (target: HTMLDivElement) => {
      try {
        const turnstile = await loadTurnstile();
        if (!cancelled) {
          widgetId = turnstile.render(target, {
            callback: setToken,
            "error-callback": clear,
            "expired-callback": clear,
            language: locale,
            sitekey: siteKey,
            size: "flexible",
            theme: "light",
          });
        }
      } catch {
        setFailed(true);
      }
    };
    if (active && element !== null) {
      void mount(element);
    }
    return () => {
      cancelled = true;
      clear();
      if (widgetId !== undefined) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [active, element, locale, siteKey]);

  return { failed, ref: setElement, token };
};
