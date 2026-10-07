import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly label: string;
  readonly href: string;
}

interface MobileNavProps {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly currentPath: string;
}

/** Header is transparent while open (see `site-header.astro`) so the blur reads as one surface. */
const OPEN_ATTRIBUTE = "data-nav-open";

/** `document.body` exists only after hydration; the portal renders once it does. */
const unsubscribe = (): void => {
  // Nothing to unsubscribe from: the snapshot never changes after hydration.
};
const subscribeNever = () => unsubscribe;

/**
 * Phone navigation: a full-screen blurred overlay under the sticky header, so
 * the logo and the toggle stay put. Links cascade down; the two-line toggle
 * morphs into an X. Hydrated only below `md` (`client:media`).
 */
const MobileNav = ({ currentPath, items }: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
  const firstLink = useRef<HTMLAnchorElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const { overflow } = document.body.style;
    root.toggleAttribute(OPEN_ATTRIBUTE, open);
    if (open) {
      document.body.style.overflow = "hidden";
      firstLink.current?.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (open && event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      root.removeAttribute(OPEN_ATTRIBUTE);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={toggle}
        variant="ghost"
        size="icon-round"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="relative -mr-2 md:hidden"
      >
        <span
          aria-hidden="true"
          className={cn(
            "bg-foreground ease-out-expo absolute h-0.5 w-6 rounded-full transition-transform duration-300 motion-reduce:transition-none",
            open ? "rotate-45" : "-translate-y-[4px]"
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "bg-foreground ease-out-expo absolute h-0.5 w-6 rounded-full transition-transform duration-300 motion-reduce:transition-none",
            open ? "-rotate-45" : "translate-y-[4px]"
          )}
        />
      </Button>
      {mounted &&
        createPortal(
          <div
            id="mobile-menu"
            inert={!open}
            data-open={open}
            className={cn(
              "bg-background/70 fixed inset-0 z-30 flex flex-col overflow-y-auto backdrop-blur-2xl backdrop-saturate-150 md:hidden",
              "pointer-events-none opacity-0 transition-opacity duration-300 ease-out",
              "data-[open=true]:pointer-events-auto data-[open=true]:opacity-100",
              "motion-reduce:transition-none"
            )}
          >
            <nav
              aria-label="Main"
              className="container-page flex flex-1 flex-col gap-1 pt-24 pb-6"
            >
              {items.map((item, index) => (
                <a
                  key={item.href}
                  ref={index === 0 ? firstLink : undefined}
                  href={item.href}
                  aria-current={currentPath === item.href ? "page" : undefined}
                  onClick={close}
                  data-i={index}
                  className="cascade text-foreground/70 aria-[current=page]:text-foreground py-2 text-4xl font-light tracking-tight lowercase outline-none focus-visible:underline"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div
              data-i={items.length}
              className="cascade container-page pb-safe"
            >
              <a
                href="/contact"
                onClick={close}
                className={cn(buttonVariants({ size: "hero" }), "w-full")}
              >
                Start a project
              </a>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default MobileNav;
