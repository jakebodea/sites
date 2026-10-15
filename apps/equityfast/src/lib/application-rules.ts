/**
 * What the EquityFast application asks and accepts. Plain functions with no
 * Effect, so the browser island and the server schema (`application.ts`)
 * enforce the same rules. Option values are stored in English whatever the
 * visitor's language; labels are translated in `i18n/ui.ts`.
 *
 * Deliberately not collected (yet): date of birth, income, and SSN digits.
 * The previous site asked for them, but leads are stored in the CMS and
 * emailed in plain text, which is not appropriate for that data. They come
 * back once applications are forwarded to E Mortgage Capital's own system.
 */
export const MIN_AMOUNT = 5000;
export const MAX_AMOUNT = 1_000_000;

export const OCCUPANCY = [
  "Primary residence",
  "Secondary home",
  "Investment property",
] as const;
export const OWNERSHIP = ["Sole owner", "Joint owner", "Trust", "LLC"] as const;
export const FOR_SALE = ["Yes", "No"] as const;

export type Occupancy = (typeof OCCUPANCY)[number];
export type Ownership = (typeof OWNERSHIP)[number];
export type ForSale = (typeof FOR_SALE)[number];

const NON_DIGITS = /\D+/gu;
const LEADING_ZEROS = /^0+(?=\d)/u;
const US_COUNTRY_CODE = /^1(?=\d{10}$)/u;
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/iu;
const ZIP = /^\d{5}(?:-\d{4})?$/u;
const STATE = /^[a-z]{2}$/iu;

export const digits = (value: string): string =>
  value.replaceAll(NON_DIGITS, "");

/** Whole dollars typed in any format (`$75,000`, `75000`), or 0. */
export const dollars = (value: string): number =>
  Number(digits(value).replace(LEADING_ZEROS, "") || "0");

/** `75000` -> `$75,000`; empty input stays empty. */
export const formatDollars = (value: string): string => {
  const amount = digits(value).replace(LEADING_ZEROS, "");
  return amount === "" ? "" : `$${Number(amount).toLocaleString("en-US")}`;
};

/** US phone as typed so far, formatted `(555) 010-1234`. */
export const formatPhone = (value: string): string => {
  const number = digits(value).replace(US_COUNTRY_CODE, "").slice(0, 10);
  if (number.length <= 3) {
    return number;
  }
  if (number.length <= 6) {
    return `(${number.slice(0, 3)}) ${number.slice(3)}`;
  }
  return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
};

export const isAmount = (value: string): boolean => {
  const amount = dollars(value);
  return amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
};

/** Ten digits whose area code and exchange don't start with 0 or 1 (NANP). */
export const isPhone = (value: string): boolean => {
  const number = digits(value).replace(US_COUNTRY_CODE, "");
  return (
    number.length === 10 &&
    !["0", "1"].includes(number.charAt(0)) &&
    !["0", "1"].includes(number.charAt(3))
  );
};

export const isEmail = (value: string): boolean => EMAIL.test(value.trim());
export const isZip = (value: string): boolean => ZIP.test(value.trim());
export const isState = (value: string): boolean => STATE.test(value.trim());

/** Everything the visitor answers, as the form holds it (strings throughout). */
export interface ApplicationAnswers {
  readonly amount: string;
  readonly firstName: string;
  readonly middleName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly consent: boolean;
  readonly propertyStreet: string;
  readonly propertyCity: string;
  readonly propertyState: string;
  readonly propertyZip: string;
  readonly occupancy: string;
  readonly primaryStreet: string;
  readonly primaryCity: string;
  readonly primaryState: string;
  readonly primaryZip: string;
  readonly ownership: string;
  readonly forSale: string;
}

export const EMPTY_ANSWERS: ApplicationAnswers = {
  amount: "",
  consent: false,
  email: "",
  firstName: "",
  forSale: "",
  lastName: "",
  middleName: "",
  occupancy: "",
  ownership: "",
  phone: "",
  primaryCity: "",
  primaryState: "",
  primaryStreet: "",
  primaryZip: "",
  propertyCity: "",
  propertyState: "",
  propertyStreet: "",
  propertyZip: "",
};

export type StepKey =
  | "amount"
  | "name"
  | "contact"
  | "propertyAddress"
  | "occupancy"
  | "primaryAddress"
  | "ownership"
  | "forSale";

/** Every question, in order (`stepsFor` drops the ones a visitor skips). */
export const STEP_KEYS: readonly StepKey[] = [
  "amount",
  "name",
  "contact",
  "propertyAddress",
  "occupancy",
  "primaryAddress",
  "ownership",
  "forSale",
];

/** The steps this visitor sees: the primary address is asked only when the property isn't it. */
export const stepsFor = (answers: ApplicationAnswers): readonly StepKey[] =>
  STEP_KEYS.filter(
    (step) =>
      step !== "primaryAddress" || answers.occupancy !== "Primary residence"
  );

type Field = keyof ApplicationAnswers;

const filled = (value: string) => value.trim() !== "";

const addressProblems = (
  answers: ApplicationAnswers,
  prefix: "property" | "primary"
): Field[] => {
  const street = `${prefix}Street` as const;
  const city = `${prefix}City` as const;
  const state = `${prefix}State` as const;
  const zip = `${prefix}Zip` as const;
  return [
    ...(filled(answers[street]) ? [] : [street]),
    ...(filled(answers[city]) ? [] : [city]),
    ...(isState(answers[state]) ? [] : [state]),
    ...(isZip(answers[zip]) ? [] : [zip]),
  ];
};

const oneOf = (options: readonly string[], value: string) =>
  options.includes(value);

/** Fields on `step` that are missing or invalid; empty means the step is complete. */
export const stepProblems = (
  step: StepKey,
  answers: ApplicationAnswers
): Field[] => {
  switch (step) {
    case "amount": {
      return isAmount(answers.amount) ? [] : ["amount"];
    }
    case "name": {
      return [
        ...(filled(answers.firstName) ? [] : (["firstName"] as const)),
        ...(filled(answers.lastName) ? [] : (["lastName"] as const)),
      ];
    }
    case "contact": {
      return [
        ...(isEmail(answers.email) ? [] : (["email"] as const)),
        ...(isPhone(answers.phone) ? [] : (["phone"] as const)),
        ...(answers.consent ? [] : (["consent"] as const)),
      ];
    }
    case "propertyAddress": {
      return addressProblems(answers, "property");
    }
    case "occupancy": {
      return oneOf(OCCUPANCY, answers.occupancy) ? [] : ["occupancy"];
    }
    case "primaryAddress": {
      return addressProblems(answers, "primary");
    }
    case "ownership": {
      return oneOf(OWNERSHIP, answers.ownership) ? [] : ["ownership"];
    }
    case "forSale": {
      return oneOf(FOR_SALE, answers.forSale) ? [] : ["forSale"];
    }
    default: {
      return [];
    }
  }
};

/** `123 Main St, Austin, TX 78701`. */
export const formatAddress = (
  street: string,
  city: string,
  state: string,
  zip: string
): string =>
  `${street.trim()}, ${city.trim()}, ${state.trim().toUpperCase()} ${zip.trim()}`;

/** Share of the home's value a line can reach across all liens (the estimate's assumption). */
export const MAX_COMBINED_LTV = 0.85;

/** Estimated line: 85% of the home's value less what is owed, within $0–$1M. */
export const availableLine = (
  homeValue: number,
  mortgageBalance: number
): number =>
  Math.min(
    MAX_AMOUNT,
    Math.max(0, Math.round(homeValue * MAX_COMBINED_LTV - mortgageBalance))
  );

/**
 * The amount to prefill from an estimate: rounded up to the next $10,000 and
 * kept inside the program range (the previous site did the same).
 */
export const prefillAmount = (estimate: number): string => {
  const rounded = Math.ceil(estimate / 10_000) * 10_000;
  const clamped = Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, rounded));
  return formatDollars(String(clamped));
};
