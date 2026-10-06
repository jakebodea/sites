/**
 * Scroll reveals: marks `[data-reveal]` elements `.is-visible` and starts
 * scroll-triggered logo drawings (`[data-play="scroll"]`) the first time each
 * enters the viewport. Plain DOM, no framework: the styles live in global.css
 * and logo.astro, and the page is fully visible without this script (the `js`
 * class that enables the hidden starting states is set by the same layout).
 */
const ENTER_MARGIN = "0px 0px -12% 0px";

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      const element = entry.target;
      element.classList.add(
        element.matches("[data-play]") ? "is-playing" : "is-visible"
      );
      observer.unobserve(element);
    }
  },
  { rootMargin: ENTER_MARGIN, threshold: 0.12 }
);

for (const element of document.querySelectorAll(
  "[data-reveal], [data-play='scroll']"
)) {
  observer.observe(element);
}
