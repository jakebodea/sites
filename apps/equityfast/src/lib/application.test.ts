import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ApplicationForm, toContactForm } from "./application.ts";

const primaryResidenceForm = {
  amount: "$75,000",
  consent: true,
  email: "jordan@example.com",
  firstName: "Jordan",
  forSale: "No",
  lastName: "Reyes",
  locale: "es",
  middleName: "A.",
  occupancy: "Investment property",
  ownership: "LLC",
  phone: "(714) 555-0123",
  propertyAddress: {
    city: "Santa Ana",
    state: "ca",
    street: "3750 S Susan Street",
    zip: "92704",
  },
  turnstileToken: "token",
};

const submitted = {
  ...primaryResidenceForm,
  primaryAddress: {
    city: "Irvine",
    state: "CA",
    street: "1 Main St",
    zip: "92618",
  },
};

const decode = Schema.decodeUnknownSync(ApplicationForm);

describe(toContactForm, () => {
  it("turns an application into a lead with its answers in form order", () => {
    expect(toContactForm(decode(submitted))).toStrictEqual({
      answers: [
        { answer: "$75,000", question: "Amount seeking" },
        {
          answer: "3750 S Susan Street, Santa Ana, CA 92704",
          question: "Property address",
        },
        { answer: "Investment property", question: "Occupancy" },
        {
          answer: "1 Main St, Irvine, CA 92618",
          question: "Primary residence",
        },
        { answer: "LLC", question: "Ownership" },
        { answer: "No", question: "Listed for sale" },
        {
          answer: "Yes (calls, texts, and email)",
          question: "Contact consent",
        },
        { answer: "Spanish", question: "Language" },
      ],
      email: "jordan@example.com",
      message: "HELOC application for $75,000.",
      name: "Jordan A. Reyes",
      phone: "(714) 555-0123",
      turnstileToken: "token",
    });
  });

  it("records the primary residence as the property when they are the same", () => {
    const form = decode({
      ...primaryResidenceForm,
      occupancy: "Primary residence",
    });
    expect(toContactForm(form).answers?.[3]).toStrictEqual({
      answer: "Same as property",
      question: "Primary residence",
    });
  });
});

describe(ApplicationForm, () => {
  it("rejects an application without contact consent", () => {
    expect(() => decode({ ...submitted, consent: false })).toThrow("consent");
  });

  it("rejects an amount outside the program range", () => {
    expect(() => decode({ ...submitted, amount: "$2,000" })).toThrow(
      "$5,000 to $1,000,000"
    );
  });
});
