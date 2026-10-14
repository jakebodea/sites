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
      className="border-navy/10 border-t bg-white p-5 sm:p-6"
    >
      <p className="text-slate-blue text-sm">{strings.drag}</p>
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
          <div key={fact.label} className="bg-paper rounded-xl px-2 py-3">
            <dt className="text-slate-blue text-xs">{fact.label}</dt>
            <dd
              className={cn(
                "mt-0.5 text-sm font-medium tabular-nums",
                fact.tone
              )}
            >
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
    <aside className="bg-navy-deep min-w-0 rounded-3xl p-6 text-white shadow-2xl sm:p-8 lg:sticky lg:top-28">
      <p className="eyebrow text-gold">{strings.plan}</p>
      <p className="mt-6 text-sm text-white/65">{strings.gained}</p>
      <output
        aria-live="polite"
        className="text-figure font-display mt-2 block tabular-nums"
      >
        {usd(totals.gain)}
      </output>
      <dl className="mt-7 divide-y divide-white/10 border-y border-white/10">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between py-3"
          >
            <dt className="text-white/65">{line.label}</dt>
            <dd className="font-medium tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
      <a
        href={`${applyHref}?amount=${encodeURIComponent(amount)}`}
        data-apply=""
        data-amount={totals.budget > 0 ? amount : undefined}
        className={cn(
          buttonVariants({ size: "hero", variant: "accent" }),
          "mt-7 w-full"
        )}
      >
        {strings.cta}
      </a>
      <Button
        type="button"
        variant="ghost-inverse"
        size="cta"
        className="mt-2 w-full"
        onClick={onReset}
      >
        {strings.reset}
      </Button>
      {disclaimer !== undefined && (
        <p className="mt-5 text-xs leading-relaxed text-white/50">
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
          <h3 className="text-navy text-lg">{strings.pick}</h3>
          <p className="text-slate-blue text-sm">{strings.pickHelp}</p>
        </div>
        <ul className="mt-4 grid gap-3">
          {rows.map((project) => {
            const active = project.budget > 0;
            const expanded = open[project.name] === true;
            return (
              <li
                key={project.name}
                className={cn(
                  "overflow-hidden rounded-2xl border transition-shadow",
                  active
                    ? "border-navy/30 bg-mist shadow-lg"
                    : "border-border bg-white shadow-xs hover:shadow-md"
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
                    <span className="text-navy block text-base leading-snug font-medium">
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
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
                      active ? "bg-gold text-navy-deep" : "bg-paper text-navy"
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
