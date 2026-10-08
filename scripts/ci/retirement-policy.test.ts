import { describe, expect, it } from "vitest";

import { retirementSite } from "./retirement-policy.ts";

describe(retirementSite, () => {
  it("accepts only the two reviewed preview stacks", () => {
    expect(() => {
      retirementSite("access-electric", "ae-preview");
    }).not.toThrow();
    expect(() => {
      retirementSite("ms-custom-homes", "preview");
    }).not.toThrow();
    expect(() => {
      retirementSite("access-electric", "prod");
    }).toThrow("Refusing retirement of access-electric/prod");
  });

  it.each([
    ["access-electric", "prod"],
    ["ms-custom-homes", "prod"],
    ["access-electric", "preview"],
    ["ms-custom-homes", "ae-preview"],
    ["jbolabs", "preview"],
    ["", "ae-preview"],
  ])("refuses %s/%s", (site, stage) => {
    expect(() => {
      retirementSite(site, stage);
    }).toThrow(/Refusing retirement/u);
  });
});
