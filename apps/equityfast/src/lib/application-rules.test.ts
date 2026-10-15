import { describe, expect, it } from "vitest";

import {
  EMPTY_ANSWERS,
  availableLine,
  formatDollars,
  formatPhone,
  isAmount,
  isPhone,
  prefillAmount,
  stepProblems,
  stepsFor,
} from "./application-rules.ts";

describe(availableLine, () => {
  it("lends up to 85% of the home's value less the mortgage", () => {
    // The previous site's own worked example: $650,000 home, $310,000 owed.
    expect(availableLine(650_000, 310_000)).toBe(242_500);
  });

  it("never goes below zero or above the $1M program maximum", () => {
    expect(availableLine(200_000, 400_000)).toBe(0);
    expect(availableLine(3_000_000, 0)).toBe(1_000_000);
  });
});

describe(prefillAmount, () => {
  it("rounds an estimate up to the next $10,000", () => {
    expect(prefillAmount(242_500)).toBe("$250,000");
  });

  it("keeps the prefill inside $5,000-$1,000,000", () => {
    expect(prefillAmount(0)).toBe("$5,000");
    expect(prefillAmount(2_400_000)).toBe("$1,000,000");
  });
});

describe(formatDollars, () => {
  it("formats whatever digits were typed", () => {
    expect(formatDollars("75000")).toBe("$75,000");
    expect(formatDollars("$0075,0x00")).toBe("$75,000");
  });
});

describe(formatPhone, () => {
  it("formats a US number as it is typed", () => {
    expect(formatPhone("714")).toBe("714");
    expect(formatPhone("7145550")).toBe("(714) 555-0");
    expect(formatPhone("+1 714 555 0123")).toBe("(714) 555-0123");
  });
});

describe(isAmount, () => {
  it("accepts the program range only", () => {
    expect(isAmount("$5,000")).toBeTruthy();
    expect(isAmount("$4,999")).toBeFalsy();
    expect(isAmount("$1,000,001")).toBeFalsy();
  });
});

describe(isPhone, () => {
  it("requires a valid area code and exchange", () => {
    expect(isPhone("(714) 555-0123")).toBeTruthy();
    expect(isPhone("(014) 555-0123")).toBeFalsy();
    expect(isPhone("(714) 155-0123")).toBeFalsy();
  });
});

describe(stepsFor, () => {
  it("skips the primary-address question when the property is the primary residence", () => {
    expect(
      stepsFor({ ...EMPTY_ANSWERS, occupancy: "Primary residence" })
    ).toStrictEqual([
      "amount",
      "name",
      "contact",
      "propertyAddress",
      "occupancy",
      "ownership",
      "forSale",
    ]);
  });

  it("asks for the primary address on a second home", () => {
    expect(
      stepsFor({ ...EMPTY_ANSWERS, occupancy: "Secondary home" })
    ).toContain("primaryAddress");
  });
});

describe(stepProblems, () => {
  it("names each missing or invalid contact field", () => {
    expect(
      stepProblems("contact", {
        ...EMPTY_ANSWERS,
        email: "jordan@",
        phone: "(714) 555-0123",
      })
    ).toStrictEqual(["email", "consent"]);
  });

  it("checks the state code and ZIP of an address", () => {
    expect(
      stepProblems("propertyAddress", {
        ...EMPTY_ANSWERS,
        propertyCity: "Santa Ana",
        propertyState: "California",
        propertyStreet: "3750 S Susan Street",
        propertyZip: "9270",
      })
    ).toStrictEqual(["propertyState", "propertyZip"]);
  });
});
