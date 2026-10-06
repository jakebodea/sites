/**
 * The intake form: the shared contact fields plus this site's own questions.
 * Options are fixed lists, validated here on the server, and travel through
 * the shared lead pipeline as labeled `answers` (stored as their own CMS
 * fields by `LeadStoreEmDash`, listed in the notification email).
 */
import { ContactForm } from "@jakebodea/cloudflare-kit/server";
import type { LeadAnswer } from "@jakebodea/cloudflare-kit/server";
import { Schema, Struct } from "effect";

import { BUDGETS, SERVICES, TIMELINES } from "./intake-options.ts";

/** Question labels: shown in the email and used to file each answer in its CMS field. */
export const INTAKE_QUESTIONS = {
  budget: "Budget",
  services: "Looking for",
  timeline: "Timeline",
  website: "Current website",
} as const;

export type IntakeQuestion = keyof typeof INTAKE_QUESTIONS;

/** What the browser sends. Phone is not asked for; answers are built here, not trusted from the client. */
export const IntakeForm = Schema.Struct({
  ...Struct.omit(ContactForm.fields, ["answers", "phone"]),
  budget: Schema.optional(Schema.Literals(BUDGETS)),
  services: Schema.optional(
    Schema.Array(Schema.Literals(SERVICES)).check(
      Schema.isMaxLength(SERVICES.length)
    )
  ),
  timeline: Schema.optional(Schema.Literals(TIMELINES)),
  website: Schema.optional(Schema.Trim.check(Schema.isMaxLength(200))),
});
export type IntakeForm = typeof IntakeForm.Type;

const answer = (
  key: IntakeQuestion,
  value: string | undefined
): LeadAnswer[] =>
  value === undefined || value === ""
    ? []
    : [{ answer: value, question: INTAKE_QUESTIONS[key] }];

/** Folds the intake questions into the shared pipeline's contact form. */
export const toContactForm = (form: IntakeForm): ContactForm => {
  const { budget, services, timeline, website, ...contact } = form;
  return {
    ...contact,
    answers: [
      ...answer("services", services?.join(", ")),
      ...answer("budget", budget),
      ...answer("timeline", timeline),
      ...answer("website", website),
    ],
  };
};

/** The answer to one intake question, for filing into its own CMS field. */
export const answerTo = (
  answers: readonly LeadAnswer[] | undefined,
  key: IntakeQuestion
): string | null =>
  answers?.find((item) => item.question === INTAKE_QUESTIONS[key])?.answer ??
  null;
