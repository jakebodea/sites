/** Absolute http(s) links leave the site: they open in a new tab. */
const EXTERNAL = /^https?:\/\//u;
const TRAILING_SLASH = /(?<=.)\/$/u;

export const isExternal = (href: string): boolean => EXTERNAL.test(href);

/**
 * Whether a menu link is the page being viewed. A section link also covers its
 * subpages (`/portfolio` while on `/portfolio/kitchens`); a locale home such as
 * `/` or `/es` only matches itself, or it would claim every page.
 */
export const isCurrentPath = (
  currentPath: string,
  href: string,
  homes: readonly string[] = ["/"]
): boolean => {
  if (isExternal(href)) {
    return false;
  }
  const current = currentPath.replace(TRAILING_SLASH, "");
  const target = href.replace(TRAILING_SLASH, "");
  if (homes.includes(target)) {
    return current === target;
  }
  return current === target || current.startsWith(`${target}/`);
};
