import { request } from "./http.ts";
/**
 * Technical SEO audit of a running stage: crawls every sitemap page plus
 * every internal link and checks what a search engine (and an answer engine)
 * sees in the server-rendered HTML. Each finding names the rule it breaks.
 * The checklist and the manual items (Search Console, backlinks, copy) live
 * in `.agents/skills/seo/SKILL.md`.
 */
import { discoverPaths } from "./sitemap.ts";

export type Severity = "error" | "warning";

export interface SeoFinding {
  readonly rule: string;
  readonly severity: Severity;
  readonly path: string;
  readonly detail: string;
}

/**
 * Non-production stages live on workers.dev or localhost. Production is the
 * custom domain, or `<site>-prod.<account>.workers.dev` for a site without one
 * (Worker names are `<site>-<stage>`).
 */
export const isProductionOrigin = (origin: string): boolean => {
  const { hostname } = new URL(origin);
  if (hostname.endsWith(".workers.dev")) {
    return hostname.split(".")[0]?.endsWith("-prod") ?? false;
  }
  return hostname !== "localhost";
};

export interface SeoOptions {
  readonly origin: string;
  /** Production must be indexable; every other stage must not be. */
  readonly production: boolean;
  /** Local CI checks page content; deployed audits also check stage policy and timing. */
  readonly checks?: "content" | "all";
}

interface PageFacts {
  readonly path: string;
  readonly status: number;
  readonly ttfbMs: number;
  readonly title: string;
  readonly description?: string | undefined;
  readonly canonical?: string | undefined;
  /** Page-level policy from `<meta name="robots">`. */
  readonly robots: string;
  /** Stage-level policy from the `X-Robots-Tag` header (non-prod stages send noindex). */
  readonly robotsHeader: string;
  readonly h1Count: number;
  readonly links: readonly string[];
  readonly images: readonly ImageFacts[];
  readonly jsonLdTypes: readonly string[];
  readonly invalidJsonLd: number;
}

interface ImageFacts {
  readonly src: string;
  /** null when the attribute is missing; "" marks a decorative image. */
  readonly alt: string | null;
  readonly sized: boolean;
}

const CRAWL_CONCURRENCY = 6;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
const TITLE_MAX = 60;
const TTFB_BUDGET_MS = 800;
const MAX_REDIRECTS = 5;
/** Pages this deep should carry a BreadcrumbList (e.g. /projects/<slug>). */
const BREADCRUMB_DEPTH = 2;
const MODERN_IMAGE =
  /(?:\.(?:webp|avif|svg)(?:\?|$))|(?:[?&]f=(?:webp|avif)\b)/u;
const OPTIMIZED_ENDPOINT = /\/_image\?/u;
const TYPE_FIELD = /"@type"\s*:\s*"(?<type>[A-Za-z]+)"/gu;

const isNoindex = (page: PageFacts): boolean => page.robots.includes("noindex");

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** Reads the SEO-relevant parts of one page with Bun's streaming HTMLRewriter. */
const parsePage = async (
  response: Response,
  path: string,
  ttfbMs: number
): Promise<PageFacts> => {
  let title = "";
  let description: string | undefined;
  let canonical: string | undefined;
  let robots = "";
  let h1Count = 0;
  let inTitle = false;
  let jsonLd = "";
  const jsonLdBlocks: string[] = [];
  const links: string[] = [];
  const images: ImageFacts[] = [];
  const rewriter = new HTMLRewriter()
    .on("head title", {
      element: () => {
        inTitle = true;
      },
      text: (chunk) => {
        if (inTitle) {
          title += chunk.text;
        }
        if (chunk.lastInTextNode) {
          inTitle = false;
        }
      },
    })
    .on('meta[name="description"]', {
      element: (element) => {
        description = element.getAttribute("content") ?? "";
      },
    })
    .on('meta[name="robots"]', {
      element: (element) => {
        robots = element.getAttribute("content") ?? "";
      },
    })
    .on('link[rel="canonical"]', {
      element: (element) => {
        canonical = element.getAttribute("href") ?? "";
      },
    })
    .on("h1", {
      element: () => {
        h1Count += 1;
      },
    })
    .on("a[href]", {
      element: (element) => {
        links.push(element.getAttribute("href") ?? "");
      },
    })
    .on("img", {
      element: (element) => {
        images.push({
          // A bare `alt` (decorative image) reads as null; only a missing attribute is an error.
          alt: element.hasAttribute("alt")
            ? (element.getAttribute("alt") ?? "")
            : null,
          sized:
            element.hasAttribute("width") && element.hasAttribute("height"),
          src: element.getAttribute("src") ?? "",
        });
      },
    })
    .on('script[type="application/ld+json"]', {
      element: (element) => {
        jsonLd = "";
        element.onEndTag(() => {
          jsonLdBlocks.push(jsonLd);
        });
      },
      text: (chunk) => {
        jsonLd += chunk.text;
      },
    });
  await rewriter.transform(response).text();
  const valid = jsonLdBlocks.filter((block) => isJson(block));
  return {
    canonical,
    description,
    h1Count,
    images,
    invalidJsonLd: jsonLdBlocks.length - valid.length,
    jsonLdTypes: valid.flatMap((block) =>
      [...block.matchAll(TYPE_FIELD)].flatMap((match) =>
        match.groups?.type === undefined ? [] : [match.groups.type]
      )
    ),
    links,
    path,
    robots,
    robotsHeader: response.headers.get("x-robots-tag") ?? "",
    status: response.status,
    title: title.trim(),
    ttfbMs,
  };
};

/** Same-origin paths only, without query or hash; external and mailto links are out of scope. */
export const internalPath = (
  href: string,
  origin: string
): string | undefined => {
  if (!URL.canParse(href, origin)) {
    return undefined;
  }
  const url = new URL(href, origin);
  return url.origin === origin && url.protocol.startsWith("http")
    ? url.pathname
    : undefined;
};

const isCrawlable = (path: string): boolean =>
  !path.startsWith("/_emdash") &&
  !path.startsWith("/_image") &&
  !path.startsWith("/_astro") &&
  !path.startsWith("/_actions");

/** Status recorded for a page that did not finish within the request timeout. */
const NO_RESPONSE = 0;

const fetchPage = async (origin: string, path: string): Promise<PageFacts> => {
  const started = performance.now();
  try {
    const response = await request(`${origin}${path}`, { redirect: "manual" });
    return await parsePage(
      response,
      path,
      Math.round(performance.now() - started)
    );
  } catch {
    return {
      h1Count: 0,
      images: [],
      invalidJsonLd: 0,
      jsonLdTypes: [],
      links: [],
      path,
      robots: "",
      robotsHeader: "",
      status: NO_RESPONSE,
      title: "",
      ttfbMs: Math.round(performance.now() - started),
    };
  }
};

/** Hops from `path` to a non-redirect response (0 when it serves directly). */
const redirectHops = async (origin: string, path: string): Promise<number> => {
  let url = `${origin}${path}`;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await request(url, { method: "HEAD", redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      return hop;
    }
    url = new URL(location, url).href;
  }
  return MAX_REDIRECTS + 1;
};

const crawl = async (
  origin: string,
  seeds: readonly string[]
): Promise<Map<string, PageFacts>> => {
  const pages = new Map<string, PageFacts>();
  // Every path ever queued, so each page is fetched once.
  const seen = new Set(seeds);
  let queue = [...seen];
  while (queue.length > 0) {
    const batch = queue.slice(0, CRAWL_CONCURRENCY);
    queue = queue.slice(CRAWL_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (path) => await fetchPage(origin, path))
    );
    for (const page of results) {
      pages.set(page.path, page);
      for (const href of page.links) {
        const path = internalPath(href, origin);
        if (path !== undefined && isCrawlable(path) && !seen.has(path)) {
          seen.add(path);
          queue.push(path);
        }
      }
    }
  }
  return pages;
};

const finding = (
  rule: string,
  severity: Severity,
  path: string,
  detail: string
): SeoFinding => ({
  detail,
  path,
  rule,
  severity,
});

type Check = (page: PageFacts, options: SeoOptions) => SeoFinding[];

const at =
  (page: PageFacts) =>
  (rule: string, severity: Severity, detail: string): SeoFinding =>
    finding(rule, severity, page.path, detail);

const headChecks: Check = (page) => {
  const add = at(page);
  const found: SeoFinding[] = [];
  if (page.title === "") {
    found.push(add("title", "error", "missing <title>"));
  } else if (page.title.length > TITLE_MAX) {
    found.push(
      add(
        "title",
        "warning",
        `${page.title.length} chars (keep under ${TITLE_MAX})`
      )
    );
  }
  const length = page.description?.length ?? 0;
  if (length === 0) {
    found.push(add("meta-description", "error", "missing meta description"));
  } else if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
    found.push(
      add(
        "meta-description",
        "warning",
        `${length} chars (aim for ${DESCRIPTION_MIN}-${DESCRIPTION_MAX})`
      )
    );
  }
  if (page.canonical === undefined || !page.canonical.startsWith("http")) {
    found.push(add("canonical", "error", "missing or relative canonical"));
  } else if (new URL(page.canonical).pathname !== page.path) {
    found.push(
      add(
        "canonical",
        "warning",
        `canonical points elsewhere: ${page.canonical}`
      )
    );
  }
  return found;
};

const indexingChecks: Check = (page, options) => {
  if (options.checks === "content") {
    return [];
  }
  const add = at(page);
  const stageNoindex = page.robotsHeader.includes("noindex");
  if (options.production && stageNoindex) {
    return [
      add(
        "indexable",
        "error",
        `production sends X-Robots-Tag: ${page.robotsHeader}`
      ),
    ];
  }
  if (!options.production && !stageNoindex && !isNoindex(page)) {
    return [
      add(
        "preview-noindex",
        "warning",
        "non-production stage is indexable; send X-Robots-Tag: noindex"
      ),
    ];
  }
  return [];
};

const structureChecks: Check = (page, options) => {
  const add = at(page);
  const found: SeoFinding[] = [];
  if (page.h1Count !== 1) {
    found.push(
      add(
        "one-h1",
        page.h1Count === 0 ? "error" : "warning",
        `${page.h1Count} <h1> elements`
      )
    );
  }
  if (page.invalidJsonLd > 0) {
    found.push(
      add(
        "structured-data",
        "error",
        `${page.invalidJsonLd} invalid JSON-LD block(s)`
      )
    );
  }
  const depth = page.path.split("/").filter((part) => part !== "").length;
  if (
    depth >= BREADCRUMB_DEPTH &&
    !page.jsonLdTypes.includes("BreadcrumbList")
  ) {
    found.push(
      add(
        "breadcrumbs",
        "warning",
        "deep page without BreadcrumbList structured data"
      )
    );
  }
  if (options.checks !== "content" && page.ttfbMs > TTFB_BUDGET_MS) {
    found.push(
      add(
        "fast-response",
        "warning",
        `HTML took ${page.ttfbMs} ms (budget ${TTFB_BUDGET_MS} ms)`
      )
    );
  }
  return found;
};

const imageChecks: Check = (page) => {
  const add = at(page);
  return page.images.flatMap((image) => [
    ...(image.alt === null
      ? [add("image-alt", "error", `no alt attribute: ${image.src}`)]
      : []),
    ...(image.sized
      ? []
      : [
          add(
            "no-layout-shift",
            "warning",
            `image without width/height: ${image.src}`
          ),
        ]),
    ...(MODERN_IMAGE.test(image.src) || OPTIMIZED_ENDPOINT.test(image.src)
      ? []
      : [
          add(
            "modern-images",
            "warning",
            `not WebP/AVIF or optimized: ${image.src}`
          ),
        ]),
  ]);
};

/** Rules that look at one page in isolation. */
export const pageFindings = (
  page: PageFacts,
  options: SeoOptions
): SeoFinding[] => {
  const add = at(page);
  if (page.status >= 300 && page.status < 400) {
    return [
      add(
        "no-internal-redirects",
        "warning",
        `linked page answers ${page.status}; link to the final URL`
      ),
    ];
  }
  if (page.status !== 200) {
    const detail =
      page.status === NO_RESPONSE
        ? "no complete response within the request timeout"
        : `HTTP ${page.status}`;
    return [add("no-broken-links", "error", detail)];
  }
  return [headChecks, indexingChecks, structureChecks, imageChecks].flatMap(
    (check) => check(page, options)
  );
};

const duplicates = (
  pages: readonly PageFacts[],
  field: "title" | "description"
): SeoFinding[] => {
  const byValue = new Map<string, string[]>();
  for (const page of pages) {
    const value = page[field];
    if (value !== undefined && value !== "") {
      byValue.set(value, [...(byValue.get(value) ?? []), page.path]);
    }
  }
  return [...byValue.entries()].flatMap(([value, paths]) =>
    paths.length > 1
      ? [
          finding(
            `unique-${field}`,
            "warning",
            paths.join(", "),
            `shared ${field}: "${value.slice(0, 80)}"`
          ),
        ]
      : []
  );
};

const ROBOTS_RULE = "robots-txt";
const ROBOTS_PATH = "/robots.txt";

const robotsFindings = async (options: SeoOptions): Promise<SeoFinding[]> => {
  const response = await request(`${options.origin}${ROBOTS_PATH}`);
  const text = response.ok ? await response.text() : "";
  const blocksAll = /^disallow:\s*\/\s*$/imu.test(text);
  const found: SeoFinding[] = [];
  if (!response.ok) {
    found.push(
      finding(ROBOTS_RULE, "error", ROBOTS_PATH, `HTTP ${response.status}`)
    );
  }
  if (options.production && blocksAll) {
    found.push(
      finding(
        ROBOTS_RULE,
        "error",
        ROBOTS_PATH,
        "production blocks all crawlers"
      )
    );
  }
  if (!/^sitemap:\s*\S+/imu.test(text)) {
    found.push(
      finding(ROBOTS_RULE, "warning", ROBOTS_PATH, "no Sitemap: line")
    );
  }
  return found;
};

export const auditSeo = async (
  options: SeoOptions
): Promise<{ readonly pages: number; readonly findings: SeoFinding[] }> => {
  const sitemap = await discoverPaths(options.origin);
  const inSitemap = new Set(sitemap);
  const pages = await crawl(options.origin, ["/", ...sitemap]);
  const served = [...pages.values()].filter((page) => page.status === 200);
  const findings: SeoFinding[] = [
    ...(await robotsFindings(options)),
    ...[...pages.values()].flatMap((page) => pageFindings(page, options)),
    ...duplicates(served, "title"),
    ...duplicates(served, "description"),
  ];
  if (sitemap.length === 0) {
    findings.push(
      finding("sitemap", "error", "/sitemap.xml", "no pages in the sitemap")
    );
  }
  const linked = new Set(
    served.flatMap((page) =>
      page.links.flatMap((href) => internalPath(href, options.origin) ?? [])
    )
  );
  for (const path of sitemap) {
    if (path !== "/" && !linked.has(path)) {
      findings.push(
        finding(
          "no-orphans",
          "warning",
          path,
          "in the sitemap but no page links to it"
        )
      );
    }
    const page = pages.get(path);
    if (page !== undefined && isNoindex(page)) {
      findings.push(
        finding(
          "indexable",
          "error",
          path,
          `in the sitemap but noindex (${page.robots})`
        )
      );
    }
  }
  for (const path of [...linked].filter(
    (link) => isCrawlable(link) && pages.get(link)?.status === 200
  )) {
    const page = pages.get(path);
    if (
      !inSitemap.has(path) &&
      path !== "/" &&
      page !== undefined &&
      !isNoindex(page)
    ) {
      findings.push(
        finding(
          "sitemap-complete",
          "warning",
          path,
          "linked page missing from the sitemap"
        )
      );
    }
  }
  const redirecting = [...pages.values()].filter(
    (page) => page.status >= 300 && page.status < 400
  );
  for (const page of redirecting) {
    const hops = await redirectHops(options.origin, page.path);
    if (hops > 1) {
      findings.push(
        finding(
          "no-redirect-chains",
          "error",
          page.path,
          `${hops} redirect hops`
        )
      );
    }
  }
  return { findings, pages: pages.size };
};
