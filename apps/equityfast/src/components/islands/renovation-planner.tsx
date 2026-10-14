import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { UiStrings } from "@/i18n/ui";
import { prefillAmount } from "@/lib/application-rules";
import { budgetCeiling, planTotals, projectGain } from "@/lib/planner";
import { cn } from "@/lib/utils";

export interface PlannerProject {
  readonly name: string;
  readonly blurb: string;
  readonly roiPercent: number;
  readonly typicalBudget: number;
}

type Strings = UiStrings["planner"];

interface RenovationPlannerProps {
  readonly projects: readonly PlannerProject[];
  readonly strings: Strings;
  readonly disclaimer: string | undefined;
  readonly applyHref: string;
}

interface PlannedRow extends PlannerProject {
  readonly budget: number;
}

/** Screen readers hear slider values as dollars. */
const USD_FORMAT: Intl.NumberFormatOptions = {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
};

const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const BUDGET_STEP = 500;
const NON_WORD = /\W+/gu;
const NON_DIGITS = /\D/gu;

const panelId = (name: string) =>
  `planner-${name.replaceAll(NON_WORD, "-").toLowerCase()}`;

const BudgetPanel = ({
  largestGain,
  onBudget,
  onRemove,
  project,
  strings,
}: {
  readonly largestGain: number;
  readonly onBudget: (budget: number) => void;
  readonly onRemove: () => void;
  readonly project: PlannedRow;
  readonly strings: Strings;
}) => {
  const gain = projectGain(project);
  const facts = [
    { label: strings.spent, tone: "text-navy", value: usd(project.budget) },
    {
      label: strings.equityAdded,
      tone: "text-emerald-700",
      value: `+${usd(gain)}`,
    },
    {
      label: strings.aboveCost,
      tone: "text-emerald-700",
      value: `+${usd(gain - project.budget)}`,
    },
  ];
  return (
    <div
      id={panelId(project.name)}
      className="border-navy/15 border-t bg-white p-5"
    >
      <p className="eyebrow text-slate-blue">{strings.drag}</p>
      <div className="mt-3 flex items-center gap-4">
        <Slider
          variant="brand"
          aria-label={`${strings.budgetFor} ${project.name}`}
          format={USD_FORMAT}
          min={0}
          max={budgetCeiling(project.typicalBudget)}
          step={BUDGET_STEP}
          value={project.budget}
          onValueChange={(next: number | readonly number[]) => {
            onBudget([next].flat()[0] ?? 0);
          }}
        />
        <Input
          aria-label={`${strings.budgetAmountFor} ${project.name}`}
          inputMode="numeric"
          variant="compact"
          value={`$${project.budget.toLocaleString("en-US")}`}
          onChange={(event) => {
            onBudget(
              Number(event.currentTarget.value.replaceAll(NON_DIGITS, ""))
            );
          }}
        />
      </div>
      <div
        className="bg-mist mt-3 h-2 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <div
          className="from-sky to-navy h-full origin-left scale-x-(--share) rounded-full bg-linear-to-r transition-transform duration-300"
          style={{ "--share": Math.min(1, gain / largestGain) }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {facts.map((fact) => (
          <div key={fact.label} className="bg-mist rounded-sm px-2 py-2">
            <dt className="text-slate-blue text-2xs font-semibold tracking-wider uppercase">
              {fact.label}
            </dt>
            <dd className={cn("text-sm font-semibold tabular-nums", fact.tone)}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button
        type="button"
        variant="quiet"
        size="bare"
        className="mt-4"
        onClick={onRemove}
      >
        {strings.remove}
      </Button>
    </div>
  );
};

const PlanSummary = ({
  applyHref,
  disclaimer,
  onReset,
  rows,
  strings,
}: {
  readonly applyHref: string;
  readonly disclaimer: string | undefined;
  readonly onReset: () => void;
  readonly rows: readonly PlannedRow[];
  readonly strings: Strings;
}) => {
  const totals = planTotals(rows);
  const amount = prefillAmount(totals.budget);
  const blended =
    totals.blendedReturn === undefined
      ? "-"
      : `${Math.round(totals.blendedReturn * 100)}%`;
  const lines = [
    { label: strings.total, value: usd(totals.budget) },
    { label: strings.valueAbove, value: usd(totals.aboveCost) },
    { label: strings.blended, value: blended },
    { label: strings.count, value: String(totals.count) },
  ];
  return (
    <aside className="border-navy min-w-0 border-2 bg-white p-5 shadow-xl sm:p-7 lg:sticky lg:top-28">
      <p className="eyebrow text-sky-ink">{strings.plan}</p>
      <p className="text-slate-blue mt-3 text-xs font-semibold tracking-wider uppercase">
        {strings.gained}
      </p>
      <output
        aria-live="polite"
        className="text-navy mt-1 block text-5xl leading-none font-semibold tabular-nums"
      >
        {usd(totals.gain)}
      </output>
      <dl className="mt-6 divide-y border-t">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between py-3"
          >
            <dt className="text-slate-blue">{line.label}</dt>
            <dd className="text-navy font-semibold tabular-nums">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      <a
        href={`${applyHref}?amount=${encodeURIComponent(amount)}`}
        data-apply=""
        data-amount={totals.budget > 0 ? amount : undefined}
        className={cn(buttonVariants({ size: "cta" }), "mt-5 w-full")}
      >
        {strings.cta}
      </a>
      <Button
        type="button"
        variant="quiet"
        size="cta"
        className="mt-2 w-full"
        onClick={onReset}
      >
        {strings.reset}
      </Button>
      {disclaimer !== undefined && (
        <p className="text-slate-blue mt-4 text-xs leading-relaxed">
          {disclaimer}
        </p>
      )}
    </aside>
  );
};

/**
 * Pick projects, set a budget for each, and see the equity they could add.
 * Each project's name, blurb, and return render on the server; budgets
 * come alive on hydration.
 */
const RenovationPlanner = ({
  applyHref,
  disclaimer,
  projects,
  strings,
}: RenovationPlannerProps) => {
  const [budgets, setBudgets] = useState<Readonly<Record<string, number>>>({});
  const [open, setOpen] = useState<Readonly<Record<string, boolean>>>({});
  const rows: PlannedRow[] = projects.map((project) => ({
    ...project,
    budget: budgets[project.name] ?? 0,
  }));
  const largestGain = Math.max(1, ...rows.map(projectGain));
  const setBudget = (name: string, budget: number) => {
    setBudgets((current) => ({ ...current, [name]: Math.max(0, budget) }));
  };
  const toggle = (project: PlannedRow) => {
    const opening = open[project.name] !== true;
    setOpen((current) => ({ ...current, [project.name]: opening }));
    if (opening && project.budget === 0) {
      setBudget(project.name, project.typicalBudget);
    }
  };
  const summary = (project: PlannedRow) =>
    strings.selectedSummary
      .replace("{budget}", usd(project.budget))
      .replace("{gain}", usd(projectGain(project)));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="eyebrow text-slate-blue">{strings.pick}</h3>
          <p className="text-slate-blue text-xs">{strings.pickHelp}</p>
        </div>
        <ul className="mt-4 grid gap-3">
          {rows.map((project) => {
            const active = project.budget > 0;
            const expanded = open[project.name] === true;
            return (
              <li
                key={project.name}
                className={cn(
                  "overflow-hidden rounded-sm border-2",
                  active
                    ? "border-navy bg-mist shadow-md"
                    : "border-border bg-white"
                )}
              >
                <Button
                  type="button"
                  variant="row"
                  size="block"
                  aria-expanded={expanded}
                  aria-controls={panelId(project.name)}
                  onClick={() => {
                    toggle(project);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-navy block text-base leading-snug font-semibold">
                      {project.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-sm leading-snug font-normal",
                        active ? "text-navy/75" : "text-slate-blue"
                      )}
                    >
                      {active ? summary(project) : project.blurb}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 px-2.5 py-1 text-xs font-semibold tabular-nums",
                      active ? "bg-gold text-navy-deep" : "bg-mist text-navy"
                    )}
                  >
                    {project.roiPercent}%
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "text-slate-blue mt-0.5 size-5 transition-transform",
                      expanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </Button>
                {expanded && (
                  <BudgetPanel
                    project={project}
                    strings={strings}
                    largestGain={largestGain}
                    onBudget={(budget) => {
                      setBudget(project.name, budget);
                    }}
                    onRemove={() => {
                      setBudget(project.name, 0);
                      setOpen((current) => ({
                        ...current,
                        [project.name]: false,
                      }));
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <PlanSummary
        applyHref={applyHref}
        disclaimer={disclaimer}
        rows={rows}
        strings={strings}
        onReset={() => {
          setBudgets({});
          setOpen({});
        }}
      />
    </div>
  );
};

export default RenovationPlanner;
