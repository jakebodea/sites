import { request } from "./http.ts";
/**
 * Smoke test against a running stage: every sitemap page renders, unknown
 * paths 404, the CMS admin answers, images on a sample of pages load, and on
 * local dev also the contact action (Turnstile test keys) and the cron
 * handler. Returns structured checks so agents can attach them to proof.
 */
import { discoverPaths } from "./sitemap.ts";

export interface SmokeCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface SmokeOptions {
  readonly origin: string;
  /** Local `alchemy dev`: Turnstile test keys and the manual cron route are available. */
  readonly local: boolean;
}

const FIXED_PATHS = ["/"];
const IMAGE_SAMPLE_PAGES = 4;
const IMAGES_PER_PAGE = 6;
const IMG_SRC = /<img\b[^>]*?\ssrc="(?<src>[^"]+)"/gu;
/** Cloudflare's documented dummy token; accepted only by the always-pass test secret. */
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const check = (name: string, ok: boolean, detail: string): SmokeCheck => ({
  detail,
  name,
  ok,
});

/** A rendered page, not just a 200: streaming SSR can fail after the status line is sent. */
const TITLE = /<title>[^<]+<\/title>/u;

const renderedPage = async (
  url: string
): Promise<{ readonly code: number; readonly complete: boolean }> => {
  try {
    const response = await request(url);
    const html = await response.text();
    return {
      code: response.status,
      complete: TITLE.test(html) && html.trimEnd().endsWith("</html>"),
    };
  } catch {
    return { code: 0, complete: false };
  }
};

const status = async (url: string): Promise<number> => {
  try {
    const response = await request(url, { redirect: "manual" });
    return response.status;
  } catch {
    return 0;
  }
};

/** Pages render on demand under dev; a handful at a time keeps the server responsive. */
const PAGE_CONCURRENCY = 6;

/** Fresh stages and just-seeded CMSes answer a few cold requests with 503; retry once. */
const RETRY_DELAY_MS = 3000;

const pageCheck = async (
  origin: string,
  route: string
): Promise<SmokeCheck> => {
  const url = `${origin}${route}`;
  const first = await renderedPage(url);
  const passed = first.code === 200 && first.complete;
  if (!passed) {
    await Bun.sleep(RETRY_DELAY_MS);
  }
  const { code, complete } = passed ? first : await renderedPage(url);
  return check(
    `page ${route}`,
    code === 200 && complete,
    complete ? `HTTP ${code}` : `HTTP ${code}, incomplete HTML`
  );
};

const pageChecks = async (
  origin: string,
  paths: readonly string[]
): Promise<SmokeCheck[]> => {
  const checks: SmokeCheck[] = [];
  for (let start = 0; start < paths.length; start += PAGE_CONCURRENCY) {
    const batch = paths.slice(start, start + PAGE_CONCURRENCY);
    checks.push(
      ...(await Promise.all(
        batch.map(async (route) => await pageCheck(origin, route))
      ))
    );
  }
  return checks;
};

const imageChecks = async (
  origin: string,
  paths: readonly string[]
): Promise<SmokeCheck[]> => {
  const checks: SmokeCheck[] = [];
  for (const route of paths.slice(0, IMAGE_SAMPLE_PAGES)) {
    const page = await request(`${origin}${route}`);
    const html = await page.text();
    const sources = [...html.matchAll(IMG_SRC)]
      .flatMap((match) =>
        match.groups?.src === undefined ? [] : [match.groups.src]
      )
      .slice(0, IMAGES_PER_PAGE);
    for (const source of sources) {
      const url = new URL(source.replaceAll("&amp;", "&"), origin);
      const response = await request(url);
      const type = response.headers.get("content-type") ?? "";
      checks.push(
        check(
          `image on ${route}`,
          response.ok && type.startsWith("image/"),
          `${response.status} ${type} ${url.pathname}`
        )
      );
    }
  }
  return checks;
};

const contactCheck = async (origin: string): Promise<SmokeCheck> => {
  const response = await request(`${origin}/_actions/contact`, {
    body: JSON.stringify({
      email: "smoke@example.com",
      message: "Automated smoke test from control-app. Please ignore.",
      name: "Smoke Test",
      turnstileToken: TURNSTILE_TEST_TOKEN,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  return check(
    "contact action",
    response.ok,
    `HTTP ${response.status} ${body.slice(0, 160)}`
  );
};

const cronCheck = async (origin: string): Promise<SmokeCheck> => {
  const code = await status(
    `${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("* * * * *")}`
  );
  return check("cron handler", code === 200, `HTTP ${code}`);
};

const needsSetup = async (origin: string): Promise<boolean> => {
  try {
    const response = await request(`${origin}/_emdash/api/setup/status`);
    const body = await response.text();
    return body.includes('"needsSetup":true');
  } catch {
    return false;
  }
};

export const smoke = async (options: SmokeOptions): Promise<SmokeCheck[]> => {
  const { origin } = options;
  const discovered = await discoverPaths(origin);
  const paths = [...new Set([...FIXED_PATHS, ...discovered])];
  const setupPending = discovered.length === 0 && (await needsSetup(origin));
  const checks = [
    check(
      "sitemap",
      discovered.length > 0 || setupPending,
      setupPending
        ? "CMS setup pending: claim the admin, or run `app -- seed --url`"
        : `${discovered.length} pages`
    ),
    ...(await pageChecks(origin, paths)),
  ];
  const missing = await status(`${origin}/__smoke-test-missing-page`);
  checks.push(check("unknown path 404s", missing === 404, `HTTP ${missing}`));
  const admin = await status(`${origin}/_emdash/admin`);
  checks.push(
    check("CMS admin", admin === 200 || admin === 302, `HTTP ${admin}`),
    ...(await imageChecks(origin, paths))
  );
  if (options.local) {
    checks.push(await contactCheck(origin), await cronCheck(origin));
  }
  return checks;
};
