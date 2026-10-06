/**
 * Marks the site header `data-scrolled` once the page leaves the top, so an
 * overlay header (transparent over the hero) turns solid. Passive and
 * rAF-throttled; the header works without it (overlay styles require `.js`).
 */
const SCROLL_THRESHOLD = 48;

const header = document.querySelector<HTMLElement>("[data-header]");
if (header !== null) {
  let queued = false;
  const update = () => {
    queued = false;
    header.toggleAttribute("data-scrolled", window.scrollY > SCROLL_THRESHOLD);
  };
  update();
  window.addEventListener(
    "scroll",
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
}
