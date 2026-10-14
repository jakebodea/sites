/**
 * The application as the server receives it, and how it becomes a lead in the
 * shared contact pipeline (`submitContact`: Turnstile -> CMS -> email). The
 * rules are the same plain functions the browser form uses.
 */
import type { ContactForm, LeadAnswer } from "@jakebodea/cloudflare-kit/server";
import { Schema } from "effect";

import {
  FOR_SALE,
  OCCUPANCY,
  OWNERSHIP,
  formatAddress,
  formatDollars,
  isAmount,
  isEmail,
  isPhone,
  isState,
  isZip,
} from "./application-rules.ts";

const text = (max: number) =>
  Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(max));

const optionalText = (max: number) =>
  Schema.optional(Schema.Trim.check(Schema.isMaxLength(max)));

const rule = (test: (value: string) => boolean, message: string) =>
  Schema.Trim.check(
    Schema.isMaxLength(254),
    Schema.makeFilter((value: string) => (test(value) ? undefined : message))
  );

const Address = Schema.Struct({
  city: text(80),
  state: rule(isState, "Use the two-letter state code"),
  street: text(160),
  zip: rule(isZip, "Enter a 5-digit ZIP code"),
});

/** What the application island sends. Field limits double as spam guards. */
export const ApplicationForm = Schema.Struct({
  amount: rule(isAmount, "Enter an amount from $5,000 to $1,000,000"),
  /** Must be true: the visitor agreed to be contacted (TCPA). */
  consent: Schema.Literal(true),
  email: rule(isEmail, "Enter a valid email address"),
  firstName: text(60),
  forSale: Schema.Literals(FOR_SALE),
  lastName: text(60),
  locale: Schema.Literals(["en", "es"]),
  middleName: optionalText(60),
  occupancy: Schema.Literals(OCCUPANCY),
  ownership: Schema.Literals(OWNERSHIP),
  phone: rule(isPhone, "Enter a 10-digit US phone number"),
  /** Omitted when the property is the primary residence. */
  primaryAddress: Schema.optional(Address),
  propertyAddress: Address,
  turnstileToken: Schema.String,
});
export type ApplicationForm = typeof ApplicationForm.Type;

const LANGUAGE_NAME = { en: "English", es: "Spanish" } as const;

/** Question labels in the lead email and CMS entry (always English, for the team reading them). */
export const AMOUNT_QUESTION = "Amount seeking";

const address = (value: typeof Address.Type) =>
  formatAddress(value.street, value.city, value.state, value.zip);

/** The application as a lead: legal name, contact, and up to 8 answers. */
export const toContactForm = (form: ApplicationForm): ContactForm => {
  const amount = formatDollars(form.amount);
  const name = [form.firstName, form.middleName, form.lastName]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
  const primary =
    form.occupancy === "Primary residence" || form.primaryAddress === undefined
      ? "Same as property"
      : address(form.primaryAddress);
  const answers: LeadAnswer[] = [
    { answer: amount, question: AMOUNT_QUESTION },
    { answer: address(form.propertyAddress), question: "Property address" },
    { answer: form.occupancy, question: "Occupancy" },
    { answer: primary, question: "Primary residence" },
    { answer: form.ownership, question: "Ownership" },
    { answer: form.forSale, question: "Listed for sale" },
    { answer: "Yes (calls, texts, and email)", question: "Contact consent" },
    { answer: LANGUAGE_NAME[form.locale], question: "Language" },
  ];
  return {
    answers,
    email: form.email,
    message: `HELOC application for ${amount}.`,
    name,
    phone: form.phone,
    turnstileToken: form.turnstileToken,
  };
};
