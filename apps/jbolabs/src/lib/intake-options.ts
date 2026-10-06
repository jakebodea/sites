/**
 * The intake form's fixed choices. Kept free of imports so the form island
 * can use them without pulling server code (the shared schema) into the
 * browser bundle; `intake.ts` validates against the same lists.
 */
export const SERVICES = [
  "New website",
  "Website redesign",
  "Web app or tool",
  "Technical consulting",
  "Ongoing care",
  "Not sure yet",
] as const;

export const BUDGETS = [
  "Under $5k",
  "$5k to $15k",
  "$15k to $40k",
  "$40k or more",
  "Not sure yet",
] as const;

export const TIMELINES = [
  "As soon as possible",
  "In 1 to 3 months",
  "3 or more months out",
  "Flexible",
] as const;
