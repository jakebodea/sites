/**
 * Resolves EmDash media into plain `<img>` attributes for React islands, which
 * cannot render EmDash's Astro `<Image>`. Mirrors EmDash's own resolution:
 * media is served from `/_emdash/api/media/file/<key>` and optimized through
 * the `/_image` endpoint (R2 + the Images binding).
 */
import { getImage } from "astro:assets";
import { Option, Schema } from "effect";

import type { MediaImage } from "./content.ts";

export interface IslandImage {
  readonly src: string;
  readonly srcSet: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

const DEFAULT_SIZE = { height: 1200, width: 1600 };

export const mediaPath = (image: MediaImage): string => {
  if (image.src !== undefined && image.src !== "") {
    return image.src;
  }
  const key = Schema.decodeUnknownOption(Schema.NonEmptyString)(
    image.meta?.storageKey
  ).pipe(Option.getOrElse(() => image.id));
  return `/_emdash/api/media/file/${key}`;
};

export const islandImage = async (
  image: MediaImage,
  origin: string,
  widths: readonly number[]
): Promise<IslandImage> => {
  const width = image.width ?? DEFAULT_SIZE.width;
  const height = image.height ?? DEFAULT_SIZE.height;
  const result = await getImage({
    format: "webp",
    height,
    src: new URL(mediaPath(image), origin).href,
    width,
    widths: widths.filter((candidate) => candidate <= width),
  });
  return {
    alt: image.alt ?? "",
    height,
    src: result.src,
    srcSet: result.srcSet.attribute,
    width,
  };
};
