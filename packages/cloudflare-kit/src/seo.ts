/**
 * Search-snippet helpers shared by every site's base layout. CMS editors write
 * whatever length they like; these keep what lands in `<title>`,
 * `<meta name="description">` and JSON-LD within what search engines show.
 * `bun run app -- seo` checks the same budgets on the rendered pages.
 */

/** Google cuts titles at roughly 60 characters. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
/** Google shows up to about 160 characters; stay under to avoid a mid-word cut. */
export const DESCRIPTION_MAX = 155;

const WHITESPACE = /\s+/gu;
const SENTENCE_END = /[.!?](?=\s|$)/gu;
/** Characters a clipped description shouldn't end on before its ellipsis. */
const DANGLING = new Set([" ", ",", ";", ":", ".", "!", "?", "-"]);

/**
 * `"<page> | <site>"`, dropping the site suffix when it would push the title
 * past {@link TITLE_MAX}: the page name is what searchers read first.
 */
export const documentTitle = (page: string, siteName: string): string => {
  const full = `${page} | ${siteName}`;
  return full.length <= TITLE_MAX ? full : page;
};

const trimDangling = (text: string): string => {
  let end = text.length;
  while (end > 0 && DANGLING.has(text.charAt(end - 1))) {
    end -= 1;
  }
  return text.slice(0, end);
};

const withStop = (text: string): string =>
  /[.!?]$/u.test(text) ? text : `${text}.`;

const clip = (text: string): string => {
  const sentenceEnds = [...text.matchAll(SENTENCE_END)].map(
    (match) => match.index + 1
  );
  const lastFit = sentenceEnds.findLast(
    (end) => end >= DESCRIPTION_MIN && end <= DESCRIPTION_MAX
  );
  if (lastFit !== undefined) {
    return text.slice(0, lastFit);
  }
  const cut = text.slice(0, DESCRIPTION_MAX).lastIndexOf(" ");
  return `${trimDangling(text.slice(0, cut))}…`;
};

/**
 * One description inside the snippet budget. Too long: keep whole sentences
 * that fit, else cut at a word and add an ellipsis. Too short (or missing):
 * append `context`, a sentence that says who and where.
 */
export const metaDescription = (
  text: string | null | undefined,
  context: string
): string => {
  const clean = (text ?? "").replaceAll(WHITESPACE, " ").trim();
  if (clean.length < DESCRIPTION_MIN) {
    const joined = clean === "" ? context : `${withStop(clean)} ${context}`;
    return joined.length <= DESCRIPTION_MAX ? joined : clip(joined);
  }
  return clean.length <= DESCRIPTION_MAX ? clean : clip(clean);
};

export interface Crumb {
  readonly label: string;
  /** Site-relative path, e.g. `/portfolio`. */
  readonly path: string;
}

interface BreadcrumbList {
  readonly "@context": "https://schema.org";
  readonly "@type": "BreadcrumbList";
  readonly itemListElement: readonly {
    readonly "@type": "ListItem";
    readonly item: string;
    readonly name: string;
    readonly position: number;
  }[];
}

/** schema.org BreadcrumbList for a trail that ends at the current page. */
export const breadcrumbJsonLd = (
  crumbs: readonly Crumb[],
  origin: string
): BreadcrumbList => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((crumb, index) => ({
    "@type": "ListItem",
    item: new URL(crumb.path, origin).href,
    name: crumb.label,
    position: index + 1,
  })),
});
