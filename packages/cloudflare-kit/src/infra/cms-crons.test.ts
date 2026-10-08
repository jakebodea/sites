import { describe, expect, it } from "vitest";

import { cmsCrons } from "./cms-crons.ts";

const crons = { backupCron: "17 10 * * *", publishCron: "* * * * *" };

describe(cmsCrons, () => {
  it("keeps both production jobs regardless of preview opt-in", () => {
    for (const previewScheduledPublishing of [false, true]) {
      expect(
        cmsCrons({ ...crons, previewScheduledPublishing, production: true })
      ).toStrictEqual([crons.publishCron, crons.backupCron]);
    }
  });

  it("leaves previews idle unless scheduled publishing is explicitly requested", () => {
    expect(
      cmsCrons({
        ...crons,
        previewScheduledPublishing: false,
        production: false,
      })
    ).toStrictEqual([]);
    expect(
      cmsCrons({
        ...crons,
        previewScheduledPublishing: true,
        production: false,
      })
    ).toStrictEqual([crons.publishCron]);
  });
});
