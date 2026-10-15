import { describe, expect, it } from "vitest";

import { opaqueColor } from "./seamless-edges.ts";

describe(opaqueColor, () => {
  it("keeps solid colors as they are", () => {
    const colors = ["rgb(31, 63, 79)", "oklch(0.21 0.08 265)", "#0b0b5e"].map(
      opaqueColor
    );
    expect(colors).toStrictEqual([
      "rgb(31, 63, 79)",
      "oklch(0.21 0.08 265)",
      "#0b0b5e",
    ]);
  });

  it("reads a mostly opaque panel as its solid color", () => {
    const colors = [
      "oklch(1 0 0 / 0.8)",
      "rgba(11, 11, 94, 0.9)",
      "color(srgb 0.1 0.2 0.3 / 85%)",
    ].map(opaqueColor);
    expect(colors).toStrictEqual([
      "oklch(1 0 0)",
      "rgb(11, 11, 94)",
      "color(srgb 0.1 0.2 0.3)",
    ]);
  });

  it("looks past see-through backgrounds and keeps half-opaque ones", () => {
    const colors = [
      "rgba(0, 0, 0, 0)",
      "transparent",
      "oklch(1 0 0 / 0.1)",
      "rgb(0 0 0 / 30%)",
      "rgba(0, 0, 0, 0.5)",
    ].map(opaqueColor);
    expect(colors).toStrictEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      "rgb(0, 0, 0)",
    ]);
  });
});
