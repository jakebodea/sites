/**
 * Seamless mobile Safari edges (https://joshpuckett.me/seamless-mobile-safari).
 * Safari ignores `theme-color` in the browser and instead tints its status bar
 * and floating toolbar from fixed elements touching the screen edges. This
 * keeps one thin fixed strip at each edge, colored like whatever the page
 * shows there right now, plus a short fade so content melts into the toolbar.
 * The root background (Safari's overscroll color) and `theme-color` (Chrome,
 * installed apps) follow the same colors.
 *
 * Mount once per page from the layout; style lives in `seamless-edges.css`.
 * Only solid colors carry: over an image, the nearest opaque background
 * behind it (the hero section's) is used.
 */

/** Below this alpha a background reads as see-through, so sampling looks past it. */
const MIN_ALPHA = 0.5;

const parseAlpha = (value: string) =>
  value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);

/** Splits `fn(channels / alpha)` or legacy `rgba(r, g, b, alpha)` into its opaque form and alpha. */
const splitAlpha = (value: string) => {
  const open = value.indexOf("(");
  if (open === -1 || !value.endsWith(")")) {
    return { alpha: 1, opaque: value };
  }
  const fn = value.slice(0, open);
  const inner = value.slice(open + 1, -1);
  const slash = inner.lastIndexOf("/");
  if (slash !== -1) {
    return {
      alpha: parseAlpha(inner.slice(slash + 1).trim()),
      opaque: `${fn}(${inner.slice(0, slash).trim()})`,
    };
  }
  const parts = inner.split(",");
  if (parts.length === 4) {
    return {
      alpha: parseAlpha(parts.at(-1)?.trim() ?? "1"),
      opaque: `${fn.replace(/a$/u, "")}(${parts.slice(0, 3).join(",")})`,
    };
  }
  return { alpha: 1, opaque: value };
};

/**
 * A computed CSS color made fully opaque, or `undefined` when it is mostly
 * transparent. A translucent panel (a blurred menu at 80 %) reads as its own
 * color, which is close enough for a browser toolbar.
 */
export const opaqueColor = (color: string): string | undefined => {
  const value = color.trim();
  if (value === "" || value === "transparent") {
    return undefined;
  }
  const { alpha, opaque } = splitAlpha(value);
  return alpha < MIN_ALPHA ? undefined : opaque;
};

/** Whether the element and its ancestors are visible enough to show their background. */
const isShown = (element: Element) => {
  let opacity = 1;
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    opacity *= Number(getComputedStyle(node).opacity);
  }
  return opacity >= MIN_ALPHA;
};

/** The color painted at a viewport point: the topmost opaque background there. */
const colorAt = (x: number, y: number, fallback: string) => {
  const { body, documentElement } = document;
  for (const element of document.elementsFromPoint(x, y)) {
    // The root background is ours to set and the body's is the fallback, so neither counts.
    if (element === body || element === documentElement) {
      continue;
    }
    const color = opaqueColor(getComputedStyle(element).backgroundColor);
    if (color !== undefined && isShown(element)) {
      return color;
    }
  }
  return fallback;
};

const edge = (className: string, side: "top" | "bottom") => {
  const element = document.createElement("div");
  element.className = className;
  element.dataset.edge = side;
  element.setAttribute("aria-hidden", "true");
  return element;
};

/** Starts tracking the page edges. Returns a cleanup that restores the document. */
export const mountSeamlessEdges = (): (() => void) => {
  const root = document.documentElement;
  const fallback =
    opaqueColor(getComputedStyle(document.body).backgroundColor) ?? "white";
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  const initialThemeColor = themeColor?.content;

  // Direct children of body, so no transformed ancestor can break `position: fixed`.
  const elements = [
    edge("seamless-edge", "top"),
    edge("seamless-edge", "bottom"),
    edge("seamless-edge-fade", "top"),
    edge("seamless-edge-fade", "bottom"),
  ];
  document.body.append(...elements);

  let queued = false;
  const update = () => {
    queued = false;
    const x = window.innerWidth / 2;
    const top = colorAt(x, 1, fallback);
    const bottom = colorAt(x, window.innerHeight - 1, fallback);
    root.style.setProperty("--seamless-edge-top", top);
    root.style.setProperty("--seamless-edge-bottom", bottom);
    // Overscroll shows the root background: the top color, or the bottom one once the page bottoms out.
    const atBottom =
      window.scrollY + window.innerHeight >= root.scrollHeight - 2;
    root.style.backgroundColor = atBottom ? bottom : top;
    if (themeColor !== null) {
      themeColor.content = top;
    }
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  // Scrolling, toolbar collapse (resize), bfcache restores, and late color changes
  // (a header turning solid, the menu opening) all move what sits at the edges.
  const targets: [EventTarget, string][] = [
    [window, "scroll"],
    [window, "resize"],
    [window, "pageshow"],
    [window, "load"],
    [document, "transitionend"],
  ];
  if (window.visualViewport !== null) {
    targets.push([window.visualViewport, "resize"]);
  }
  for (const [target, type] of targets) {
    target.addEventListener(type, schedule, { passive: true });
  }
  // Reduced motion skips transitions, so also watch the root's state attributes.
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    attributeFilter: ["class", "data-mobile-menu-open"],
  });
  update();

  return () => {
    for (const [target, type] of targets) {
      target.removeEventListener(type, schedule);
    }
    observer.disconnect();
    for (const element of elements) {
      element.remove();
    }
    root.style.removeProperty("--seamless-edge-top");
    root.style.removeProperty("--seamless-edge-bottom");
    root.style.removeProperty("background-color");
    if (themeColor !== null && initialThemeColor !== undefined) {
      themeColor.content = initialThemeColor;
    }
  };
};
