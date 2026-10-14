import type { ComponentProps, ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { UiStrings } from "@/i18n/ui";
import {
  FOR_SALE,
  OCCUPANCY,
  OWNERSHIP,
  formatDollars,
  formatPhone,
} from "@/lib/application-rules";
import type { ApplicationAnswers, StepKey } from "@/lib/application-rules";
import { cn } from "@/lib/utils";

import ChoiceGroup from "./choice-group";

type TextField = Exclude<keyof ApplicationAnswers, "consent">;

export interface StepFieldsProps {
  readonly step: StepKey;
  readonly title: string;
  readonly answers: ApplicationAnswers;
  readonly problems: readonly string[];
  readonly strings: UiStrings;
  readonly onText: (field: TextField, value: string) => void;
  readonly onConsent: (value: boolean) => void;
}

const upperState = (value: string) => value.toUpperCase().slice(0, 2);

const NO_EXTRA: Partial<ComponentProps<"input">> = {};

const TextInput = ({
  answers,
  extra = NO_EXTRA,
  field,
  format,
  label,
  onText,
  problems,
}: {
  readonly answers: ApplicationAnswers;
  readonly extra?: Partial<ComponentProps<"input">>;
  readonly field: TextField;
  readonly format?: (value: string) => string;
  readonly label: ReactNode;
  readonly onText: StepFieldsProps["onText"];
  readonly problems: readonly string[];
}) => {
  const invalid = problems.includes(field);
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={`apply-${field}`} size="large">
        {label}
      </FieldLabel>
      <Input
        id={`apply-${field}`}
        variant="large"
        value={answers[field]}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          onText(field, format === undefined ? raw : format(raw));
        }}
        {...extra}
      />
    </Field>
  );
};

const AddressFields = ({
  prefix,
  ...props
}: Omit<StepFieldsProps, "step" | "title" | "onConsent"> & {
  readonly prefix: "property" | "primary";
}) => {
  const t = props.strings.form;
  // A separate autofill section, so the browser doesn't reuse the property address.
  const section = prefix === "primary" ? "section-primary " : "";
  const shared = {
    answers: props.answers,
    onText: props.onText,
    problems: props.problems,
  };
  return (
    <div className="grid gap-5">
      <TextInput
        {...shared}
        field={`${prefix}Street`}
        label={t.street}
        extra={{
          autoComplete: `${section}street-address`,
          placeholder: "123 Main St",
        }}
      />
      <TextInput
        {...shared}
        field={`${prefix}City`}
        label={t.city}
        extra={{
          autoComplete: `${section}address-level2`,
          placeholder: "Santa Ana",
        }}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          {...shared}
          field={`${prefix}State`}
          label={t.state}
          format={upperState}
          extra={{
            autoComplete: `${section}address-level1`,
            maxLength: 2,
            placeholder: "CA",
          }}
        />
        <TextInput
          {...shared}
          field={`${prefix}Zip`}
          label={t.zip}
          extra={{
            autoComplete: `${section}postal-code`,
            inputMode: "numeric",
            maxLength: 10,
            placeholder: "92704",
          }}
        />
      </div>
    </div>
  );
};

/** The inputs for one step of the application. */
const StepFields = (props: StepFieldsProps) => {
  const { answers, onConsent, onText, problems, step, strings, title } = props;
  const t = strings.form;
  const shared = { answers, onText, problems };
  const choice = (
    field: "occupancy" | "ownership" | "forSale",
    options: readonly string[],
    labels: Readonly<Record<string, string>>
  ) => (
    <ChoiceGroup
      title={title}
      options={options}
      labels={labels}
      value={answers[field]}
      invalid={problems.includes(field)}
      onChange={(value) => {
        onText(field, value);
      }}
    />
  );
  switch (step) {
    case "amount": {
      return (
        <div>
          <TextInput
            {...shared}
            field="amount"
            label={t.amountLabel}
            format={formatDollars}
            extra={{ inputMode: "numeric", placeholder: "$75,000" }}
          />
          <p className="text-slate-blue mt-2 text-xs">{t.amountHelp}</p>
        </div>
      );
    }
    case "name": {
      return (
        <div className="grid gap-5">
          <TextInput
            {...shared}
            field="firstName"
            label={t.firstName}
            extra={{ autoComplete: "given-name", placeholder: "Jordan" }}
          />
          <TextInput
            {...shared}
            field="middleName"
            label={
              <>
                {t.middleName}{" "}
                <span className="text-slate-blue text-sm font-normal">
                  ({t.optional})
                </span>
              </>
            }
            extra={{ autoComplete: "additional-name", placeholder: "A." }}
          />
          <TextInput
            {...shared}
            field="lastName"
            label={t.lastName}
            extra={{ autoComplete: "family-name", placeholder: "Reyes" }}
          />
        </div>
      );
    }
    case "contact": {
      return (
        <div className="grid gap-5">
          <TextInput
            {...shared}
            field="email"
            label={strings.emailLabel}
            extra={{
              autoComplete: "email",
              placeholder: "you@email.com",
              type: "email",
            }}
          />
          <TextInput
            {...shared}
            field="phone"
            label={t.phoneLabel}
            format={formatPhone}
            extra={{
              autoComplete: "tel",
              inputMode: "tel",
              placeholder: "(555) 010-1234",
              type: "tel",
            }}
          />
          <label
            className={cn(
              "bg-paper text-navy flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-base leading-relaxed",
              problems.includes("consent")
                ? "border-destructive"
                : "border-border"
            )}
          >
            <Checkbox
              size="large"
              checked={answers.consent}
              aria-invalid={problems.includes("consent") || undefined}
              onCheckedChange={(checked) => {
                onConsent(checked);
              }}
              className="mt-1"
            />
            <span>{t.consent}</span>
          </label>
        </div>
      );
    }
    case "propertyAddress": {
      return <AddressFields {...props} prefix="property" />;
    }
    case "primaryAddress": {
      return <AddressFields {...props} prefix="primary" />;
    }
    case "occupancy": {
      return choice("occupancy", OCCUPANCY, strings.options.occupancy);
    }
    case "ownership": {
      return choice("ownership", OWNERSHIP, strings.options.ownership);
    }
    case "forSale": {
      return choice("forSale", FOR_SALE, strings.options.forSale);
    }
    default: {
      return null;
    }
  }
};

export default StepFields;
