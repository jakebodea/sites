import { Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { IntakeForm, answerTo, toContactForm } from "./intake.ts";

const base = {
  email: "sam@example.com",
  message: "We need a new site for our bakery before spring.",
  name: "Sam Lee",
  turnstileToken: "token",
};

describe(IntakeForm, () => {
  it("accepts the listed options and rejects anything else", () => {
    const ok = Schema.decodeUnknownExit(IntakeForm)({
      ...base,
      budget: "$5k to $15k",
      services: ["New website", "Ongoing care"],
    });
    expect(Exit.isSuccess(ok)).toBeTruthy();
    const bad = Schema.decodeUnknownExit(IntakeForm)({
      ...base,
      budget: "a million dollars",
    });
    expect(Exit.isFailure(bad)).toBeTruthy();
  });

  it("does not let the browser send its own answers", () => {
    const form = Schema.decodeUnknownSync(IntakeForm)({
      ...base,
      answers: [{ answer: "x", question: "y" }],
    });
    expect(toContactForm(form).answers).toStrictEqual([]);
  });
});

describe(toContactForm, () => {
  it("turns intake questions into labeled answers and keeps the referrer", () => {
    const form = Schema.decodeUnknownSync(IntakeForm)({
      ...base,
      referrer: " Alex Rivera ",
      services: ["New website", "Ongoing care"],
      timeline: "Flexible",
      website: "",
    });
    const contact = toContactForm(form);
    expect(contact.referrer).toBe("Alex Rivera");
    expect(contact.answers).toStrictEqual([
      { answer: "New website, Ongoing care", question: "Looking for" },
      { answer: "Flexible", question: "Timeline" },
    ]);
    expect(answerTo(contact.answers, "timeline")).toBe("Flexible");
    expect(answerTo(contact.answers, "budget")).toBeNull();
  });
});
