import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import { request } from "./http.ts";
/**
 * Smoke test against a running stage: every sitemap page renders, unknown
 * paths 404, the CMS admin answers, images on a sample of pages load, and on
 * local dev also the lead form's action (Turnstile test keys) and the cron
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
  readonly submit?: boolean;
  /** The site runs EmDash: check its admin, and treat an empty sitemap as setup pending. */
  readonly cms: boolean;
  /** The lead form submission to exercise; defaults to the shared contact form. */
  readonly form?: SmokeForm;
}

const SITE_PATH = /^\//u;

/**
 * An Astro action, a valid body for it (the Turnstile test token is added),
 * and the page the form lives on (CI audits it with Lighthouse).
 */
const SmokeForm = Schema.Struct({
  action: Schema.String,
  body: Schema.Record(Schema.String, Schema.Json),
  page: Schema.String.check(Schema.isPattern(SITE_PATH)),
});
export type SmokeForm = typeof SmokeForm.Type;

/** File a site ships when its lead form is not the shared `contact` action. */
export const SMOKE_FORM_FILE = "smoke.form.json";

const CONTACT_FORM: SmokeForm = {
  action: "contact",
  body: {
    email: "smoke@example.com",
    message: "Automated smoke test from control-app. Please ignore.",
    name: "Smoke Test",
  },
  page: "/contact",
};

/** The site's own form fixture from `<site>/smoke.form.json`, else the contact form. */
export const smokeForm = (directory: string): SmokeForm => {
  const file = path.join(directory, SMOKE_FORM_FILE);
  if (!existsSync(file)) {
    return CONTACT_FORM;
  }
  return Schema.decodeUnknownSync(Schema.fromJsonString(SmokeForm))(
    readFileSync(file, "utf-8")
  );
};

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
/** Every page opens with its headline; a page without one rendered no content (e.g. an unseeded CMS). */
const H1 = /<h1[\s>]/u;
/** Layout chrome can pass with an empty main; real pages have copy in `<main>`. */
const MIN_MAIN_TEXT = 48;

const visibleText = (html: string): string => {
  let text = html;
  text = text.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ");
  text = text.replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ");
  return text
    .replaceAll(/<[^>]{0,200}>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
};

const mainInnerHtml = (html: string): string => {
  const open = /<main\b[^>]*>/iu.exec(html);
  if (open === null || open.index === undefined) {
    return "";
  }
  const start = open.index + open[0].length;
  const close = html.indexOf("</main>", start);
  return close === -1 ? "" : html.slice(start, close);
};

const mainTextLength = (html: string): number =>
  visibleText(mainInnerHtml(html)).length;

export interface PageVerdict {
  readonly ok: boolean;
  readonly detail: string;
}

/** Judge one fetched page: a full document with a title and a headline. */
export const pageVerdict = (code: number, html: string): PageVerdict => {
  if (!(TITLE.test(html) && html.trimEnd().endsWith("</html>"))) {
    return { detail: `HTTP ${code}, incomplete HTML`, ok: false };
  }
  if (!H1.test(html)) {
    return {
      detail: `HTTP ${code}, no <h1>: page rendered no content`,
      ok: false,
    };
  }
  const mainChars = mainTextLength(html);
  if (mainChars < MIN_MAIN_TEXT) {
    return {
      detail: `HTTP ${code}, main has ${mainChars} visible characters (need ${MIN_MAIN_TEXT})`,
      ok: false,
    };
  }
  return { detail: `HTTP ${code}`, ok: code === 200 };
};

const renderedPage = async (url: string): Promise<PageVerdict> => {
  try {
    const response = await request(url);
    return pageVerdict(response.status, await response.text());
  } catch {
    return { detail: "no response", ok: false };
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

const adminAlias = async (origin: string): Promise<string> => {
  try {
    const response = await request(`${origin}/_admin/content`, {
      redirect: "manual",
    });
    return response.status === 302
      ? new URL(response.headers.get("location") ?? "", origin).href
      : "";
  } catch {
    return "";
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
  if (!first.ok) {
    await Bun.sleep(RETRY_DELAY_MS);
  }
  const { detail, ok } = first.ok ? first : await renderedPage(url);
  return check(`page ${route}`, ok, detail);
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

const formCheck = async (
  origin: string,
  form: SmokeForm
): Promise<SmokeCheck> => {
  const response = await request(`${origin}/_actions/${form.action}`, {
    body: JSON.stringify({
      ...form.body,
      turnstileToken: TURNSTILE_TEST_TOKEN,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  return check(
    `${form.action} action`,
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
  const setupPending =
    options.cms && discovered.length === 0 && (await needsSetup(origin));
  const checks = [
    check(
      "sitemap",
      discovered.length > 0 || setupPending,
      setupPending
        ? "CMS bootstrap pending: run credentialed `app -- seed --url`"
        : `${discovered.length} pages`
    ),
    ...(await pageChecks(origin, paths)),
  ];
  const missing = await status(`${origin}/__smoke-test-missing-page`);
  checks.push(check("unknown path 404s", missing === 404, `HTTP ${missing}`));
  if (options.cms) {
    const admin = await status(`${origin}/_emdash/admin`);
    checks.push(
      check("CMS admin", admin === 200 || admin === 302, `HTTP ${admin}`)
    );
    const alias = await adminAlias(origin);
    checks.push(
      check(
        "/_admin alias",
        alias === `${origin}/_emdash/admin/content`,
        alias || "no redirect"
      )
    );
  }
  checks.push(...(await imageChecks(origin, paths)));
  if (options.local) {
    checks.push(
      ...(options.submit === false
        ? []
        : [await formCheck(origin, options.form ?? CONTACT_FORM)]),
      await cronCheck(origin)
    );
  }
  return checks;
};
