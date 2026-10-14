import { actions, isInputError } from "astro:actions";
import { LoaderCircleIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { UiStrings } from "@/i18n/ui";
import { stepProblems, stepsFor } from "@/lib/application-rules";
import type { ApplicationAnswers, StepKey } from "@/lib/application-rules";
import { cn } from "@/lib/utils";

import { clearDraft, readDraft, writeDraft } from "./application/draft";
import StepFields from "./application/step-fields";
import ApplicationSuccess from "./application/success";
import { useTurnstile } from "./application/use-turnstile";

export interface ApplicationFormProps {
  readonly locale: "en" | "es";
  readonly strings: UiStrings;
  readonly turnstileSiteKey: string;
  /** Amount carried over from an estimate, e.g. `$250,000`. */
  readonly initialAmount?: string | undefined;
  /** Renders the step question; the dialog wraps it in its accessible title. */
  readonly renderTitle?: (title: string) => ReactNode;
  /** Called by the success screen's button; without it the button links home. */
  readonly onDone?: () => void;
  readonly homeHref: string;
}

type Status =
  | { readonly state: "editing" }
  | { readonly state: "sending" }
  | { readonly state: "sent"; readonly firstName: string }
  | { readonly state: "error"; readonly message: string };

const defaultTitle = (title: string) => (
  <h2 className="text-navy text-question font-display">{title}</h2>
);

const address = (
  answers: ApplicationAnswers,
  prefix: "property" | "primary"
): Address => ({
  city: answers[`${prefix}City`],
  state: answers[`${prefix}State`].toUpperCase(),
  street: answers[`${prefix}Street`],
  zip: answers[`${prefix}Zip`],
});

interface Address {
  readonly city: string;
  readonly state: string;
  readonly street: string;
  readonly zip: string;
}

/** What the `apply` action decodes (`ApplicationForm` in lib/application.ts). */
interface ApplyInput {
  readonly amount: string;
  readonly consent: boolean;
  readonly email: string;
  readonly firstName: string;
  readonly forSale: string;
  readonly lastName: string;
  readonly locale: "en" | "es";
  readonly middleName: string;
  readonly occupancy: string;
  readonly ownership: string;
  readonly phone: string;
  primaryAddress?: Address;
  readonly propertyAddress: Address;
  readonly turnstileToken: string;
}

const submitApplication = async (
  answers: ApplicationAnswers,
  locale: "en" | "es",
  turnstileToken: string
) => {
  const input: ApplyInput = {
    amount: answers.amount,
    consent: answers.consent,
    email: answers.email,
    firstName: answers.firstName,
    forSale: answers.forSale,
    lastName: answers.lastName,
    locale,
    middleName: answers.middleName,
    occupancy: answers.occupancy,
    ownership: answers.ownership,
    phone: answers.phone,
    propertyAddress: address(answers, "property"),
    turnstileToken,
  };
  // The primary residence is asked (and sent) only when it isn't the property.
  if (answers.occupancy !== "Primary residence") {
    input.primaryAddress = address(answers, "primary");
  }
  return await actions.apply(input);
};

const submitLabel = (last: boolean, sending: boolean, t: UiStrings["form"]) => {
  if (!last) {
    return t.continue;
  }
  return sending ? t.sending : t.submit;
};

/**
 * The EquityFast application, one question per step. Used inside the dialog
 * on every page and on its own at `/apply`. Answers are checked with the same
 * rules the server applies; Turnstile renders on the last step so its token
 * is fresh when the request is sent. Rendered only in the browser (it reads
 * the saved draft on first render).
 */
const ApplicationForm = ({
  homeHref,
  initialAmount,
  locale,
  onDone,
  renderTitle = defaultTitle,
  strings,
  turnstileSiteKey,
}: ApplicationFormProps) => {
  const t = strings.form;
  const [answers, setAnswers] = useState<ApplicationAnswers>(() => {
    const saved = readDraft().answers;
    return { ...saved, amount: initialAmount ?? saved.amount };
  });
  const [stepKey, setStepKey] = useState<StepKey>(() =>
    initialAmount === undefined ? readDraft().step : "amount"
  );
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<Status>({ state: "editing" });
  const heading = useRef<HTMLDivElement>(null);

  const steps = stepsFor(answers);
  const index = Math.max(0, steps.indexOf(stepKey));
  const step = steps[index] ?? "amount";
  const last = index === steps.length - 1;
  const {
    failed: turnstileFailed,
    ref: turnstileRef,
    token,
  } = useTurnstile({
    active: last,
    locale,
    siteKey: turnstileSiteKey,
  });

  const update = (next: ApplicationAnswers, field: string) => {
    setAnswers(next);
    setProblems((current) => current.filter((name) => name !== field));
    writeDraft({ answers: next, step: stepKey });
  };

  const go = (next: StepKey) => {
    setStepKey(next);
    writeDraft({ answers, step: next });
    setProblems([]);
    setStatus({ state: "editing" });
    // Move focus to the new question so screen readers announce it.
    requestAnimationFrame(() => heading.current?.focus());
  };

  const send = async () => {
    setStatus({ state: "sending" });
    const { error } = await submitApplication(answers, locale, token);
    if (error === undefined) {
      clearDraft();
      setStatus({ firstName: answers.firstName.trim(), state: "sent" });
      return;
    }
    setStatus({
      message: isInputError(error) ? t.errorInvalid : error.message,
      state: "error",
    });
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = stepProblems(step, answers);
    setProblems(found);
    if (found.length > 0 || status.state === "sending") {
      return;
    }
    const next = steps[index + 1];
    if (next !== undefined) {
      go(next);
    } else if (token !== "") {
      void send();
    }
  };

  if (status.state === "sent") {
    return (
      <ApplicationSuccess
        firstName={status.firstName}
        homeHref={homeHref}
        onDone={onDone}
        renderTitle={renderTitle}
        strings={t}
      />
    );
  }

  const copy = t.steps[step];
  const sending = status.state === "sending";
  const previous = steps[index - 1];

  return (
    <form onSubmit={onSubmit} noValidate>
      <div ref={heading} tabIndex={-1} className="outline-none">
        {renderTitle(copy.title)}
      </div>
      <p className="text-slate-blue mt-2 text-base leading-relaxed">
        {"sub" in copy ? copy.sub : t.saves}
      </p>
      <div className="mt-5 flex gap-1" aria-hidden="true">
        {steps.map((key, position) => (
          <span
            key={key}
            className={cn(
              "h-1 flex-1 rounded-full",
              position <= index ? "bg-gold" : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {index + 1} / {steps.length}
      </p>

      <div className="mt-6">
        <StepFields
          step={step}
          title={copy.title}
          answers={answers}
          problems={problems}
          strings={strings}
          onText={(field, value) => {
            update({ ...answers, [field]: value }, field);
          }}
          onConsent={(value) => {
            update({ ...answers, consent: value }, "consent");
          }}
        />
      </div>

      {last && (
        <div className="mt-6">
          <div ref={turnstileRef} className="min-h-16" />
          <p className="text-slate-blue mt-2 text-center text-xs">
            {t.security}
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <FieldError className="mt-4">{t.errorInvalid}</FieldError>
      )}
      {status.state === "error" && (
        <FieldError variant="banner" className="mt-4">
          {status.message}
        </FieldError>
      )}
      {turnstileFailed && (
        <FieldError variant="banner" className="mt-4">
          {t.turnstileFailed}
        </FieldError>
      )}

      <div className="mt-6 flex items-center gap-3">
        {previous !== undefined && (
          <Button
            type="button"
            variant="outline-navy"
            size="cta"
            onClick={() => {
              go(previous);
            }}
          >
            {t.back}
          </Button>
        )}
        <Button
          type="submit"
          size="cta"
          className="ml-auto"
          disabled={sending || (last && token === "")}
        >
          {sending && (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          )}
          {submitLabel(last, sending, t)}
        </Button>
      </div>
      <p className="text-slate-blue mt-5 text-center text-xs">{t.disclaimer}</p>
    </form>
  );
};

export default ApplicationForm;
