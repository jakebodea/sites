import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { resolveSeedMedia } from "./seed-media.ts";

describe(resolveSeedMedia, () => {
  it("makes seed media URLs absolute and leaves other URLs alone", () => {
    const seed = JSON.stringify({
      a: { $media: { url: "/_seed/media/logo.png" } },
      b: { $media: { url: "https://cdn.example.com/x.jpg" } },
      link: "/contact",
    });
    const Media = Schema.Struct({
      $media: Schema.Struct({ url: Schema.String }),
    });
    const resolved = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({ a: Media, b: Media, link: Schema.String })
      )
    )(resolveSeedMedia(seed, "https://example.com/_seed/media/"));
    expect(resolved.a.$media.url).toBe(
      "https://example.com/_seed/media/logo.png"
    );
    expect(resolved.b.$media.url).toBe("https://cdn.example.com/x.jpg");
    expect(resolved.link).toBe("/contact");
  });
});
