import { useSyncExternalStore } from "react";

/**
 * A spot at the start of the admin top bar's actions (before "View Site") for
 * the Assistant button. EmDash's admin has no header extension point, so the
 * slot is an element added to its header and re-added whenever React renders
 * a new header (sign-in pages have none).
 */
const SLOT_ATTRIBUTE = "data-site-assistant-slot";

const findActions = (): Element | null =>
  document.querySelector(
    "header.sticky > div.flex.items-center.gap-2:last-child"
  );

const ensureSlot = (): HTMLElement | null => {
  const actions = findActions();
  if (actions === null) {
    return null;
  }
  const existing = actions.querySelector<HTMLElement>(
    `:scope > [${SLOT_ATTRIBUTE}]`
  );
  if (existing !== null) {
    return existing;
  }
  const slot = document.createElement("div");
  slot.setAttribute(SLOT_ATTRIBUTE, "");
  slot.className = "contents";
  actions.prepend(slot);
  return slot;
};

let current: HTMLElement | null = null;

const subscribe = (onChange: () => void) => {
  const update = () => {
    const next = ensureSlot();
    if (next !== current) {
      current = next;
      onChange();
    }
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
  };
};

export const useHeaderSlot = (): HTMLElement | null =>
  useSyncExternalStore(subscribe, () => current);
