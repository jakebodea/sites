import { useEffect } from "react";

/**
 * While the Assistant is open on desktop it is a second pane beside the page,
 * so the admin's nav collapses to its icon rail to make room, and expands
 * again on close if it was the Assistant that collapsed it.
 *
 * EmDash owns the nav's Kumo `Sidebar.Provider` (uncontrolled, in its own
 * React root), so the nav is toggled through its own footer trigger. The
 * `data-site-assistant` mark on <html> lets the CSS make room for the pane.
 */
const NAV = "[data-sidebar-wrapper][data-side=left]";
const MARK = "data-site-assistant";
/** Kumo's mobile breakpoint: below it the nav is a drawer and the Assistant fills the screen. */
const DESKTOP = "(min-width: 768px)";

const toggleNav = (state: "expanded" | "collapsed"): boolean => {
  const nav = document.querySelector(`${NAV}[data-state=${state}]`);
  const trigger = nav?.querySelector<HTMLElement>(
    ":scope > aside [data-sidebar=trigger]"
  );
  if (trigger === null || trigger === undefined) {
    return false;
  }
  trigger.click();
  return true;
};

export const useSidePane = (open: boolean): void => {
  useEffect(() => {
    const root = document.documentElement;
    const collapsed =
      open && globalThis.matchMedia(DESKTOP).matches && toggleNav("expanded");
    root.toggleAttribute(MARK, open);
    return () => {
      root.removeAttribute(MARK);
      if (collapsed) {
        toggleNav("collapsed");
      }
    };
  }, [open]);
};
