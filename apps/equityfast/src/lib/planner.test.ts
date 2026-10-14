import { describe, expect, it } from "vitest";

import { budgetCeiling, planTotals } from "./planner.ts";

describe(planTotals, () => {
  it("adds up budgets, equity gained, and the blended return", () => {
    // Garage door at 327% and a roof at 109%, at their typical budgets:
    // 4,500 x 3.27 = 14,715 and 30,000 x 1.09 = 32,700.
    const totals = planTotals([
      { budget: 4500, roiPercent: 327 },
      { budget: 30_000, roiPercent: 109 },
      { budget: 0, roiPercent: 264 },
    ]);
    expect(totals).toMatchObject({
      aboveCost: 12_915,
      budget: 34_500,
      count: 2,
      gain: 47_415,
    });
    expect(totals.blendedReturn).toBeCloseTo(1.3743, 4);
  });

  it("has no blended return before anything is planned", () => {
    expect(
      planTotals([{ budget: 0, roiPercent: 180 }]).blendedReturn
    ).toBeUndefined();
    expect(planTotals([{ budget: 0, roiPercent: 180 }]).count).toBe(0);
  });
});

describe(budgetCeiling, () => {
  it("lets the slider reach three times the typical budget, at least $50,000", () => {
    expect(budgetCeiling(4500)).toBe(50_000);
    expect(budgetCeiling(30_000)).toBe(90_000);
  });
});
