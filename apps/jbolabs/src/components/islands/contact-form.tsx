import {
  analyticsIdentity,
  captureAnalytics,
} from "@jakebodea/cloudflare-kit/analytics/client";
import { actions, isInputError } from "astro:actions";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, Ref, SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/choice-chip";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BUDGETS, SERVICES, TIMELINES } from "@/lib/intake-options";
import { currentReferrer } from "@/lib/referral";
import { cn } from "@/lib/utils";

import { loadTurnstile } from "./turnstile";

interface ContactFormProps {
  /** Public Turnstile site key (Cloudflare's always-pass test key outside prod). */
  readonly turnstileSiteKey: string;
}

type Status =
  | { readonly state: "idle" }
  | { readonly state: "sending" }
  | { readonly state: "sent" }
  | { readonly state: "error"; readonly message: string };

/**
 * The form is one <form> split into steps: every step stays mounted (hidden
 * when inactive) so FormData sees all fields, and each step's fields are
 * checked with the browser's own validation before moving on. The easy,
 * engaging questions come first; contact details come last.
 */
const STEPS = ["the project", "budget and timing", "about you"] as const;
const LAST = STEPS.length - 1;

const field = (data: FormData, name: string): string => {
  const value = data.get(name);
  return value === null || value instanceof File ? "" : value;
};

const optional = (value: string) => (value.trim() === "" ? undefined : value);

/** Narrows a submitted radio value to one of its listed options. */
const choice = <T extends string>(
  options: readonly T[],
  value: string
): T | undefined => options.find((option) => option === value);

const Optional = () => (
  <span className="text-muted-foreground font-normal">(optional)</span>
);

/** Reports the first invalid field inside a step; true when the step is complete. */
const stepIsValid = (step: HTMLElement | null) => {
  if (step === null) {
    return true;
  }
  const fields: (HTMLInputElement | HTMLTextAreaElement)[] = [
    ...step.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea"
    ),
  ];
  const invalid = fields.find((element) => !element.checkValidity());
  if (invalid !== undefined) {
    invalid.reportValidity();
  }
  return invalid === undefined;
};

const Step = ({
  index,
  current,
  stepRef,
  children,
}: {
  readonly index: number;
  readonly current: number;
  readonly stepRef: (element: HTMLElement | null) => void;
  readonly children: ReactNode;
}) => (
  <section
    ref={stepRef}
    hidden={index !== current}
    aria-labelledby={`intake-step-${index}`}
    className="animate-in fade-in slide-in-from-right-3 flex flex-col gap-8 duration-300"
  >
    <h2
      id={`intake-step-${index}`}
      tabIndex={-1}
      className="display text-3xl outline-none sm:text-4xl"
    >
      {STEPS[index]}
    </h2>
    {children}
  </section>
);

const Progress = ({ current }: { readonly current: number }) => (
  <div className="flex flex-col gap-3">
    <p className="text-muted-foreground text-sm" aria-live="polite">
      Step {current + 1} of {STEPS.length}
    </p>
    <div className="flex gap-1.5" aria-hidden="true">
      {STEPS.map((step, index) => (
        <span
          key={step}
          className="bg-input h-1 flex-1 overflow-hidden rounded-full"
        >
          <span
            className={cn(
              "bg-signal block h-full origin-left transition-transform duration-500 ease-out",
              index <= current ? "scale-x-100" : "scale-x-0"
            )}
          />
        </span>
      ))}
    </div>
  </div>
);

const ProjectFields = () => (
  <FieldGroup spacing="roomy">
    <FieldSet>
      <FieldLegend variant="label">What can I help with?</FieldLegend>
      <div className="flex flex-wrap gap-2">
        {SERVICES.map((service) => (
          <ChoiceChip key={service} name="services" value={service}>
            {service}
          </ChoiceChip>
        ))}
      </div>
    </FieldSet>
    <Field>
      <FieldLabel htmlFor="intake-message">
        Tell me about the project
      </FieldLabel>
      <Textarea
        id="intake-message"
        name="message"
        required
        minLength={10}
        maxLength={5000}
        rows={6}
        size="lg"
        placeholder="What are you hoping to build or change, and what does success look like?"
      />
    </Field>
  </FieldGroup>
);

const BudgetFields = () => (
  <FieldGroup spacing="roomy">
    <FieldSet>
      <FieldLegend variant="label">
        Rough budget <Optional />
      </FieldLegend>
      <div className="flex flex-wrap gap-2">
        {BUDGETS.map((budget) => (
          <ChoiceChip key={budget} type="radio" name="budget" value={budget}>
            {budget}
          </ChoiceChip>
        ))}
      </div>
    </FieldSet>
    <FieldSet>
      <FieldLegend variant="label">
        Timeline <Optional />
      </FieldLegend>
      <div className="flex flex-wrap gap-2">
        {TIMELINES.map((timeline) => (
          <ChoiceChip
            key={timeline}
            type="radio"
            name="timeline"
            value={timeline}
          >
            {timeline}
          </ChoiceChip>
        ))}
      </div>
    </FieldSet>
  </FieldGroup>
);

/** Contact details, plus the spam check that guards the final send. */
const AboutFields = ({
  referrerRef,
  widgetRef,
}: {
  readonly referrerRef: Ref<HTMLInputElement>;
  readonly widgetRef: Ref<HTMLDivElement>;
}) => (
  <FieldGroup spacing="roomy">
    <div className="grid gap-6 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="intake-name">Your name</FieldLabel>
        <Input
          id="intake-name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          size="lg"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="intake-email">Email</FieldLabel>
        <Input
          id="intake-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          size="lg"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="intake-company">
          Company <Optional />
        </FieldLabel>
        <Input
          id="intake-company"
          name="company"
          autoComplete="organization"
          maxLength={120}
          size="lg"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="intake-website">
          Current website <Optional />
        </FieldLabel>
        <Input
          id="intake-website"
          name="website"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com"
          maxLength={200}
          size="lg"
        />
      </Field>
    </div>
    <Field>
      <FieldLabel htmlFor="intake-referrer">
        Who referred you? <Optional />
      </FieldLabel>
      <Input
        id="intake-referrer"
        name="referrer"
        maxLength={120}
        size="lg"
        ref={referrerRef}
        placeholder="A name, so I can say thanks"
      />
    </Field>
    <div ref={widgetRef} className="min-h-[65px]" />
  </FieldGroup>
);

const ContactForm = ({ turnstileSiteKey }: ContactFormProps) => {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [token, setToken] = useState("");
  const [current, setCurrent] = useState(0);
  // The spam check mounts once the last step is first shown: Turnstile cannot
  // size itself inside a hidden container.
  const [reachedEnd, setReachedEnd] = useState(false);
  const referrer = useRef<HTMLInputElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  const steps = useRef<(HTMLElement | null)[]>([]);
  const started = useRef(false);
  const moved = useRef(false);

  // Prefill from a referral link (`?ref=`), after hydration so SSR markup matches.
  useEffect(() => {
    const name = currentReferrer(new URL(window.location.href));
    const input = referrer.current;
    if (name !== undefined && input !== null && input.value === "") {
      input.value = name;
    }
  }, []);

  // Move focus to the new step's heading so keyboard and screen reader users follow along.
  useEffect(() => {
    if (moved.current) {
      steps.current[current]?.querySelector("h2")?.focus();
    }
  }, [current]);

  useEffect(() => {
    const element = widget.current;
    let widgetId: string | undefined;
    let cancelled = false;
    const mount = async (target: HTMLDivElement) => {
      try {
        const turnstile = await loadTurnstile();
        if (cancelled) {
          return;
        }
        widgetId = turnstile.render(target, {
          callback: setToken,
          "error-callback": () => {
            setToken("");
          },
          "expired-callback": () => {
            setToken("");
          },
          sitekey: turnstileSiteKey,
          size: "flexible",
          theme: "light",
        });
      } catch {
        setStatus({
          message: "The spam check could not load. Please refresh the page.",
          state: "error",
        });
      }
    };
    if (reachedEnd && element !== null) {
      void mount(element);
    }
    return () => {
      cancelled = true;
      if (widgetId !== undefined) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [turnstileSiteKey, reachedEnd]);

  const onFirstInput = () => {
    if (!started.current) {
      started.current = true;
      captureAnalytics("contact form started");
    }
  };

  const goTo = (index: number) => {
    moved.current = true;
    setCurrent(index);
    if (index === LAST) {
      setReachedEnd(true);
    }
  };

  const next = () => {
    if (stepIsValid(steps.current[current] ?? null)) {
      goTo(Math.min(current + 1, LAST));
    }
  };

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter in an earlier step advances instead of sending.
    if (current < LAST) {
      next();
      return;
    }
    const data = new FormData(event.currentTarget);
    setStatus({ state: "sending" });
    const services = data
      .getAll("services")
      .flatMap((value) =>
        value instanceof File ? [] : (choice(SERVICES, value) ?? [])
      );
    const { error } = await actions.contact({
      analytics: analyticsIdentity(),
      budget: choice(BUDGETS, field(data, "budget")),
      company: optional(field(data, "company")),
      email: field(data, "email"),
      message: field(data, "message"),
      name: field(data, "name"),
      referrer: optional(field(data, "referrer")),
      services: services.length === 0 ? undefined : services,
      timeline: choice(TIMELINES, field(data, "timeline")),
      turnstileToken: token,
      website: optional(field(data, "website")),
    });
    if (error === undefined) {
      captureAnalytics("contact form submitted");
      setStatus({ state: "sent" });
      return;
    }
    captureAnalytics("contact form failed", { form_error: error.code });
    setStatus({
      message: isInputError(error)
        ? "Please check your details and try again."
        : error.message,
      state: "error",
    });
  };

  if (status.state === "sent") {
    return (
      <output className="flex flex-col items-start gap-5 py-6 sm:py-10">
        <span
          className="bg-signal-soft text-signal flex size-12 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <CheckIcon className="size-5" strokeWidth={2.5} />
        </span>
        <h2 className="display text-4xl leading-tight sm:text-5xl">
          Thank you.{" "}
          <strong className="headline-strong">Your note is in.</strong>
        </h2>
        <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
          I read every enquiry personally and will reply by email within two
          business days.
        </p>
      </output>
    );
  }

  const sending = status.state === "sending";
  const stepRef = (index: number) => (element: HTMLElement | null) => {
    steps.current[index] = element;
  };
  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      onInput={onFirstInput}
      noValidate={false}
      className="flex flex-col gap-10"
    >
      <Progress current={current} />

      <Step index={0} current={current} stepRef={stepRef(0)}>
        <ProjectFields />
      </Step>

      <Step index={1} current={current} stepRef={stepRef(1)}>
        <BudgetFields />
      </Step>

      <Step index={2} current={current} stepRef={stepRef(2)}>
        <AboutFields referrerRef={referrer} widgetRef={widget} />
      </Step>

      <div className="flex flex-col gap-4">
        {status.state === "error" && <FieldError>{status.message}</FieldError>}
        <div className="flex gap-3">
          {current > 0 && (
            <Button
              type="button"
              variant="outline"
              size="hero"
              onClick={() => {
                goTo(current - 1);
              }}
              disabled={sending}
            >
              <ArrowLeftIcon aria-hidden="true" />
              Back
            </Button>
          )}
          {current < LAST ? (
            <Button
              key="next"
              type="button"
              size="hero"
              className="flex-1"
              onClick={next}
            >
              Next
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : (
            <Button
              key="send"
              type="submit"
              size="hero"
              className="flex-1"
              disabled={sending || token === ""}
            >
              {sending && (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              )}
              {sending ? "Sending" : "Send enquiry"}
              {!sending && <ArrowRightIcon aria-hidden="true" />}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-center text-sm">
          I reply personally within two business days.
        </p>
      </div>
    </form>
  );
};

export default ContactForm;
