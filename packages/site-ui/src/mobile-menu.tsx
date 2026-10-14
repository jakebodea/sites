import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";

import { isCurrentPath, isExternal } from "./links.ts";

export interface MobileMenuItem {
  readonly label: string;
  readonly href: string;
}

/** The pieces a site can restyle; each value is merged over the default classes. */
export type MobileMenuSlot =
  | "toggle"
  | "bar"
  | "overlay"
  | "nav"
  | "link"
  | "footer";

export interface MobileMenuProps {
  readonly items: readonly MobileMenuItem[];
  readonly currentPath: string;
  /** Locale homes (`/`, `/es`) only match themselves when marking the current link. */
  readonly homes?: readonly string[];
  readonly labels?: {
    readonly open: string;
    readonly close: string;
    readonly nav: string;
  };
  readonly classNames?: Partial<Record<MobileMenuSlot, string>>;
  /** Below the links: the call to action, a language switch. Any link inside closes the menu. */
  readonly children?: ReactNode;
}

const DEFAULT_LABELS = { close: "Close menu", nav: "Main", open: "Open menu" };
const NO_CLASSES: Partial<Record<MobileMenuSlot, string>> = {};

/** The default look, in each site's semantic tokens. Sites override per slot. */
const DEFAULTS: Record<MobileMenuSlot, string> = {
  bar: "absolute h-0.5 w-6 rounded-full bg-current transition-transform duration-300 ease-out motion-reduce:transition-none",
  footer: "px-6 pt-6",
  link: "py-2 text-4xl tracking-tight text-foreground/70 outline-none aria-[current=page]:text-foreground focus-visible:underline",
  nav: "flex flex-1 flex-col gap-1 px-6 pt-8 pb-6",
  overlay:
    "fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-y-auto bg-background/80 backdrop-blur-2xl backdrop-saturate-150 opacity-0 pointer-events-none transition-opacity duration-300 ease-out data-[open=true]:pointer-events-auto data-[open=true]:opacity-100 motion-reduce:transition-none",
  toggle:
    "relative -mr-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-current outline-none focus-visible:ring-2 focus-visible:ring-current/40",
};

const OPEN_ATTRIBUTE = "data-mobile-menu-open";
const MENU_ID = "mobile-menu";

/** `document.body` exists only after hydration; the portal renders once it does. */
const unsubscribe = (): void => {
  // Nothing to unsubscribe from: the snapshot never changes after hydration.
};
const subscribeNever = () => unsubscribe;

/**
 * Phone navigation: a full-screen overlay under the sticky site header, so the
 * logo and the toggle stay put and the bar stays solid. Links cascade in; the
 * two-line toggle morphs into an X. Escape closes and returns focus to the
 * toggle. Adapted from jbolabs.com. Hydrate it only below the site's desktop
 * breakpoint (`client:media`).
 */
const MobileMenu = ({
  children,
  classNames = NO_CLASSES,
  currentPath,
  homes,
  items,
  labels = DEFAULT_LABELS,
}: MobileMenuProps) => {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
  const toggle = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const slot = (name: MobileMenuSlot) =>
    twMerge(clsx(DEFAULTS[name], classNames[name]));

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute(OPEN_ATTRIBUTE, open);
    if (open) {
      // Start below the header wherever it sits (an announcement bar can push it down).
      const header = toggle.current?.closest("header");
      const top = header?.getBoundingClientRect().bottom ?? 0;
      overlay.current?.style.setProperty("--mobile-menu-top", `${top}px`);
      firstLink.current?.focus({ preventScroll: true });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (open && event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    // Links in the slot are server-rendered HTML, so close on any link click by delegation.
    const onClick = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        setOpen(false);
      }
    };
    const panel = overlay.current;
    document.addEventListener("keydown", onKeyDown);
    panel?.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      panel?.removeEventListener("click", onClick);
      root.removeAttribute(OPEN_ATTRIBUTE);
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={slot("toggle")}
      >
        <span
          aria-hidden="true"
          className={twMerge(
            slot("bar"),
            open ? "rotate-45" : "-translate-y-1"
          )}
        />
        <span
          aria-hidden="true"
          className={twMerge(
            slot("bar"),
            open ? "-rotate-45" : "translate-y-1"
          )}
        />
      </button>
      {mounted &&
        createPortal(
          <div
            ref={overlay}
            id={MENU_ID}
            inert={!open}
            data-open={open}
            className={twMerge("mobile-menu-overlay", slot("overlay"))}
          >
            <nav aria-label={labels.nav} className={slot("nav")}>
              {items.map((item, index) => (
                <a
                  key={item.href}
                  ref={index === 0 ? firstLink : undefined}
                  href={item.href}
                  {...(isExternal(item.href)
                    ? { rel: "noopener", target: "_blank" }
                    : {})}
                  aria-current={
                    isCurrentPath(currentPath, item.href, homes)
                      ? "page"
                      : undefined
                  }
                  style={{ "--i": index }}
                  className={twMerge("mobile-menu-cascade", slot("link"))}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            {children !== undefined && (
              <div
                style={{ "--i": items.length }}
                className={twMerge(
                  "mobile-menu-cascade mobile-menu-footer",
                  slot("footer")
                )}
              >
                {children}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

export default MobileMenu;
