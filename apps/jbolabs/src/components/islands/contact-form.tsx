import { actions, isInputError } from "astro:actions";
import { ArrowRightIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";

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

const ContactForm = ({ turnstileSiteKey }: ContactFormProps) => {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [token, setToken] = useState("");
  const referrer = useRef<HTMLInputElement>(null);
  const widget = useRef<HTMLDivElement>(null);

  // Prefill from a referral link (`?ref=`), after hydration so SSR markup matches.
  useEffect(() => {
    const name = currentReferrer(new URL(window.location.href));
    const input = referrer.current;
    if (name !== undefined && input !== null && input.value === "") {
      input.value = name;
    }
  }, []);

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
    if (element !== null) {
      void mount(element);
    }
    return () => {
      cancelled = true;
      if (widgetId !== undefined) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [turnstileSiteKey]);

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ state: "sending" });
    const services = data
      .getAll("services")
      .flatMap((value) =>
        value instanceof File ? [] : (choice(SERVICES, value) ?? [])
      );
    const { error } = await actions.contact({
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
      setStatus({ state: "sent" });
      return;
    }
    setStatus({
      message: isInputError(error)
        ? "Please check your details and try again."
        : error.message,
      state: "error",
    });
  };

  if (status.state === "sent") {
    return (
      <output className="flex flex-col items-start gap-4 py-10">
        <span className="bg-signal size-2.5 rounded-full" aria-hidden="true" />
        <h2 className="text-3xl leading-tight sm:text-4xl">
          Thank you. Your note is in.
        </h2>
        <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
          I read every enquiry personally and will reply by email within two
          business days.
        </p>
      </output>
    );
  }

  const sending = status.state === "sending";
  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate={false}
    >
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

        <FieldSet>
          <FieldLegend variant="label">
            Rough budget <Optional />
          </FieldLegend>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((budget) => (
              <ChoiceChip
                key={budget}
                type="radio"
                name="budget"
                value={budget}
              >
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

        <Field>
          <FieldLabel htmlFor="intake-referrer">
            Who referred you? <Optional />
          </FieldLabel>
          <Input
            id="intake-referrer"
            name="referrer"
            maxLength={120}
            size="lg"
            ref={referrer}
            placeholder="A name, so I can say thanks"
          />
        </Field>

        <div ref={widget} className="min-h-[65px]" />
        {status.state === "error" && <FieldError>{status.message}</FieldError>}
        <Button
          type="submit"
          size="hero"
          disabled={sending || token === ""}
          className="w-full sm:w-auto sm:self-start"
        >
          {sending && (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          )}
          {sending ? "Sending" : "Send"}
          {!sending && <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </FieldGroup>
    </form>
  );
};

export default ContactForm;
