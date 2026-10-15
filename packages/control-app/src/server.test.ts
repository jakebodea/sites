import { describe, expect, it } from "vitest";

import { isWedged } from "./server.ts";

describe(isWedged, () => {
  it("flags the font data Astro drops when a cold boot re-optimizes", () => {
    expect(
      isWedged(
        '[Website] workerd/server/server.c++:6685: error: Uncaught exception: remote.jsg.Error: FontFamilyNotFound: No data was found for the `"--font-body"` family passed to the `<Font>` component.'
      )
    ).toBeTruthy();
  });

  it("flags a second React copy left by a mid-boot reload", () => {
    expect(
      isWedged(
        "[Website] TypeError: Cannot read properties of null (reading 'useState')"
      )
    ).toBeTruthy();
  });

  it("lets the transient errors of an in-progress optimize keep polling", () => {
    expect(
      isWedged(
        "[Website] [vite] program reload\n[Website]   code: 'ERR_FILE_NOT_FOUND_IN_OPTIMIZED_DEP_DIR',"
      )
    ).toBeFalsy();
  });
});
