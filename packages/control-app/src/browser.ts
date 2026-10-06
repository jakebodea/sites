/**
 * Real-browser verification with Playwright driving the system Chrome:
 * sign in to the CMS, capture full-page screenshots at desktop and phone
 * widths, read the accessibility tree, and record short videos. Every file
 * lands under the site's `.artifacts` directory and is returned for proof.
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";

import { pathSlug } from "./site.ts";
import type { SiteContext } from "./site.ts";

export const DEFAULT_WIDTHS = [1280, 375] as const;
const PHONE_MAX_WIDTH = 480;
const SCROLL_STEP_PX = 600;
const SETTLE_MS = 400;
/** Longest wait for running CSS animations and transitions before a capture. */
const ANIMATION_CAP_MS = 6000;

export interface PageReport {
  readonly path: string;
  readonly width: number;
  readonly status: number;
  readonly file: string;
  readonly brokenImages: readonly string[];
  readonly consoleErrors: readonly string[];
}

const authFile = (site: SiteContext) => path.join(site.artifacts, "auth.json");

const launch = async (): Promise<Browser> => {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    throw new Error(
      "Could not launch Chrome. Install Google Chrome, or run `bunx playwright install chromium`.",
      { cause: error }
    );
  }
};

const newContext = async (
  browser: Browser,
  site: SiteContext,
  options: {
    readonly width: number;
    readonly auth: boolean;
    readonly video?: string;
  }
): Promise<BrowserContext> => {
  const auth = authFile(site);
  if (options.auth && !existsSync(auth)) {
    throw new Error("No CMS session yet: run `bun run app -- login` first.");
  }
  return await browser.newContext({
    recordVideo:
      options.video === undefined ? undefined : { dir: options.video },
    storageState: options.auth ? auth : undefined,
    viewport: {
      height: options.width <= PHONE_MAX_WIDTH ? 812 : 900,
      width: options.width,
    },
  });
};

/** Scrolls through the page so lazy images load, then returns to the top. */
const loadEverything = async (page: Page): Promise<void> => {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += SCROLL_STEP_PX) {
    await page.mouse.wheel(0, SCROLL_STEP_PX);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(SETTLE_MS);
  // Scroll reveals and entrance animations started during the scroll-through must
  // finish, or the capture shows them half-faded. Looping animations never finish.
  await Promise.race([
    page.evaluate(async () => {
      await Promise.allSettled(
        document
          .getAnimations()
          .flatMap((animation) =>
            animation.effect?.getTiming().iterations ===
            Number.POSITIVE_INFINITY
              ? []
              : [animation.finished]
          )
      );
    }),
    page.waitForTimeout(ANIMATION_CAP_MS),
  ]);
};

/**
 * Images that failed to load. Images not rendered at this width (a `hidden
 * lg:block` ancestor) are skipped: lazy images there never load, by design.
 */
const brokenImages = async (page: Page): Promise<string[]> =>
  await page.evaluate(() => {
    const broken: string[] = [];
    for (const image of document.images) {
      const loaded = image.complete && image.naturalWidth > 0;
      if (image.checkVisibility() && !loaded) {
        broken.push(image.currentSrc || image.src);
      }
    }
    return broken;
  });

/**
 * Signs in to EmDash with its dev-only bypass (seeds the site's content on
 * first use and creates a dev admin), then saves the session for `--auth`.
 * Only works against `alchemy dev`; deployed stages use real passkeys.
 */
export const login = async (site: SiteContext): Promise<string> => {
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(
      `${site.origin}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`,
      { waitUntil: "load" }
    );
    if (response === null || !response.ok()) {
      throw new Error(
        `Dev bypass failed (${response?.status() ?? "no response"}). Is \`bun run app -- start\` running?`
      );
    }
    await page.waitForURL("**/_emdash/admin**");
    mkdirSync(site.artifacts, { recursive: true });
    await context.storageState({ path: authFile(site) });
    return authFile(site);
  } finally {
    await browser.close();
  }
};

export const screenshot = async (
  site: SiteContext,
  paths: readonly string[],
  options: {
    readonly origin: string;
    readonly widths: readonly number[];
    readonly auth: boolean;
  }
): Promise<PageReport[]> => {
  const directory = path.join(site.artifacts, "screens");
  mkdirSync(directory, { recursive: true });
  const browser = await launch();
  const reports: PageReport[] = [];
  try {
    for (const width of options.widths) {
      const context = await newContext(browser, site, {
        auth: options.auth,
        width,
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      for (const route of paths) {
        consoleErrors.length = 0;
        const response = await page.goto(`${options.origin}${route}`, {
          waitUntil: "load",
        });
        await loadEverything(page);
        const file = path.join(directory, `${pathSlug(route)}-${width}.png`);
        await page.screenshot({ fullPage: true, path: file });
        reports.push({
          brokenImages: await brokenImages(page),
          consoleErrors: [...consoleErrors],
          file,
          path: route,
          status: response?.status() ?? 0,
          width,
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return reports;
};

/** The accessibility tree as YAML: what a screen reader (and an agent) sees. */
export const snapshot = async (
  site: SiteContext,
  route: string,
  options: { readonly origin: string; readonly auth: boolean }
): Promise<string> => {
  const browser = await launch();
  try {
    const context = await newContext(browser, site, {
      auth: options.auth,
      width: DEFAULT_WIDTHS[0],
    });
    const page = await context.newPage();
    await page.goto(`${options.origin}${route}`, { waitUntil: "load" });
    return await page.locator("body").ariaSnapshot();
  } finally {
    await browser.close();
  }
};

/** Records a scroll-through of the page as WebM. */
export const record = async (
  site: SiteContext,
  route: string,
  options: {
    readonly origin: string;
    readonly width: number;
    readonly auth: boolean;
  }
): Promise<string> => {
  const directory = path.join(site.artifacts, "videos");
  mkdirSync(directory, { recursive: true });
  const browser = await launch();
  try {
    const context = await newContext(browser, site, {
      auth: options.auth,
      video: directory,
      width: options.width,
    });
    const page = await context.newPage();
    await page.goto(`${options.origin}${route}`, { waitUntil: "load" });
    await loadEverything(page);
    const video = page.video();
    await context.close();
    const recorded = await video?.path();
    if (recorded === undefined) {
      throw new Error("Playwright did not record a video");
    }
    const file = path.join(
      directory,
      `${pathSlug(route)}-${options.width}.webm`
    );
    renameSync(recorded, file);
    return file;
  } finally {
    await browser.close();
  }
};
