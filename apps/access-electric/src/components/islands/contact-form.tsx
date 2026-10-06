import {
  analyticsIdentity,
  captureAnalytics,
} from "@jakebodea/cloudflare-kit/analytics/client";
import { actions, isInputError } from "astro:actions";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

const ContactForm = ({ turnstileSiteKey }: ContactFormProps) => {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [token, setToken] = useState("");
  const widget = useRef<HTMLDivElement>(null);
  const started = useRef(false);

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

  const onFirstInput = () => {
    if (!started.current) {
      started.current = true;
      captureAnalytics("contact form started");
    }
  };

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ state: "sending" });
    const { error } = await actions.contact({
      analytics: analyticsIdentity(),
      company: optional(field(data, "company")),
      email: field(data, "email"),
      message: field(data, "message"),
      name: field(data, "name"),
      phone: optional(field(data, "phone")),
      turnstileToken: token,
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
      <output className="border-border bg-card flex flex-col items-start gap-3 rounded-xl border p-8">
        <CheckCircle2Icon className="text-navy size-8" aria-hidden="true" />
        <h2 className="text-2xl">Thanks, we have your message.</h2>
        <p className="text-muted-foreground">
          Our team will reply within one business day.
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
      onInput={onFirstInput}
      className="border-border bg-card rounded-xl border p-6 shadow-xs sm:p-8"
      noValidate={false}
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="contact-name">Name</FieldLabel>
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-company">
              Company{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="contact-company"
              name="company"
              autoComplete="organization"
              maxLength={120}
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-email">Email</FieldLabel>
            <Input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-phone">
              Phone{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="contact-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              className="h-11"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="contact-message">Project details</FieldLabel>
          <Textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={5000}
            rows={6}
            className="min-h-36"
            placeholder="Scope, location, schedule, and anything else we should know."
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
          {sending ? "Sending" : "Send message"}
        </Button>
      </FieldGroup>
    </form>
  );
};

export default ContactForm;
