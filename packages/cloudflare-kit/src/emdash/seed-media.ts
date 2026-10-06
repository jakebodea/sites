/**
 * Astro integration that lets an EmDash seed ship its own images.
 *
 * EmDash seeds reference media by URL (`{ "$media": { "url": ... } }`) and
 * download them during setup; local files are not supported, and the SSRF
 * guard refuses private hosts. So the seed keeps site-relative URLs under
 * `/_seed/media/`, this integration
 *
 * 1. copies `seed/media/` into `public/_seed/media/` (gitignored) so every
 *    stage serves the originals itself, and
 * 2. writes `.emdash/seed.json` (EmDash's first seed lookup path) with those
 *    URLs made absolute against `mediaBase`.
 *
 * Without a `mediaBase` the URLs stay relative and setup skips the images.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

export const SEED_MEDIA_PATH = "/_seed/media/";

export interface SeedMediaOptions {
  /** Absolute base the seed's `/_seed/media/<file>` URLs resolve against, e.g. `https://example.com/_seed/media`. */
  readonly mediaBase: string | undefined;
  /** Seed source, relative to the project root. */
  readonly seed?: string;
  /** Directory of seed images, relative to the project root. */
  readonly media?: string;
}

/** Rewrites `/_seed/media/<file>` URLs in a seed's JSON text to `<mediaBase>/<file>`. */
export const resolveSeedMedia = (
  seedJson: string,
  mediaBase: string
): string => {
  const base = mediaBase.endsWith("/") ? mediaBase : `${mediaBase}/`;
  return seedJson.replaceAll(`"${SEED_MEDIA_PATH}`, `"${base}`);
};

const syncDirectory = (from: string, to: string): number => {
  mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const name of readdirSync(from)) {
    const source = path.join(from, name);
    const target = path.join(to, name);
    if (
      !existsSync(target) ||
      statSync(target).size !== statSync(source).size
    ) {
      copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
};

export const seedMedia = (options: SeedMediaOptions): AstroIntegration => ({
  hooks: {
    "astro:config:setup": ({ config, logger }) => {
      const root = fileURLToPath(config.root);
      const mediaDir = path.join(root, options.media ?? "seed/media");
      if (existsSync(mediaDir)) {
        const publicMedia = path.join(
          fileURLToPath(config.publicDir),
          SEED_MEDIA_PATH
        );
        const copied = syncDirectory(mediaDir, publicMedia);
        if (copied > 0) {
          logger.info(
            `copied ${copied} seed images to public${SEED_MEDIA_PATH}`
          );
        }
      }
      const seedJson = readFileSync(
        path.join(root, options.seed ?? "seed/seed.json"),
        "utf-8"
      );
      const resolved =
        options.mediaBase === undefined
          ? seedJson
          : resolveSeedMedia(seedJson, options.mediaBase);
      mkdirSync(path.join(root, ".emdash"), { recursive: true });
      writeFileSync(path.join(root, ".emdash", "seed.json"), resolved);
      if (options.mediaBase === undefined) {
        logger.warn(
          "no seed media base configured: setup will skip seed images"
        );
      }
    },
  },
  name: "@jakebodea/cloudflare-kit/seed-media",
});
