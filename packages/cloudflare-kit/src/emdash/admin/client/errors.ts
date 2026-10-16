/**
 * Why a turn failed, read from the error message the stream ends with. The
 * panel answers each kind differently: a rate limit passes with time, a
 * conversation too long for the model only gets longer on retry.
 */
export type FailureKind = "rate-limit" | "too-long" | "other";

/** AI Gateway's limit (HTTP 429) and Workers AI's capacity errors. */
const RATE_LIMIT = /\b429\b|rate[ -]?limit|too many requests|capacity/iu;

/** Providers word an overflowing prompt many ways; these are the common ones. */
const TOO_LONG =
  /context (?:length|window)|maximum context|too many tokens|prompt is too long|input (?:is )?too long|exceeds? (?:the )?(?:maximum|max) (?:number of )?tokens/iu;

export const failureKind = (message: string): FailureKind => {
  if (RATE_LIMIT.test(message)) {
    return "rate-limit";
  }
  return TOO_LONG.test(message) ? "too-long" : "other";
};
