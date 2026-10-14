import { useId, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { UiStrings } from "@/i18n/ui";
import {
  availableLine,
  MIN_AMOUNT,
  prefillAmount,
} from "@/lib/application-rules";
import { cn } from "@/lib/utils";

interface EquityEstimatorProps {
  readonly strings: UiStrings["estimator"];
  readonly applyHref: string;
}

interface Range {
  readonly max: number;
  readonly min: number;
  readonly start: number;
  readonly step: number;
}

const HOME_VALUE: Range = {
  max: 3_000_000,
  min: 100_000,
  start: 650_000,
  step: 5000,
};
const BALANCE: Range = { max: 2_500_000, min: 0, start: 310_000, step: 5000 };

/** Screen readers hear slider values as dollars. */
const USD_FORMAT: Intl.NumberFormatOptions = {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
};

const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const DollarSlider = ({
  label,
  onChange,
  range,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly range: Range;
  readonly value: number;
}) => {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span id={id} className="text-sm text-white/65">
          {label}
        </span>
        <span className="text-lg font-medium tabular-nums">{usd(value)}</span>
      </div>
      <Slider
        variant="brand"
        aria-labelledby={id}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        format={USD_FORMAT}
        onValueChange={(next: number | readonly number[]) => {
          onChange([next].flat()[0] ?? range.min);
        }}
        className="mt-3"
      />
    </div>
  );
};

/**
 * The hero's quick estimate: two sliders and the line they imply. The CTA
 * is a real link to the application carrying the amount, so it works
 * before (or without) hydration; the dialog opens over it once loaded.
 */
const EquityEstimator = ({ applyHref, strings }: EquityEstimatorProps) => {
  const [home, setHome] = useState(HOME_VALUE.start);
  const [balance, setBalance] = useState(BALANCE.start);
  const line = availableLine(home, balance);
  const amount = prefillAmount(Math.max(line, MIN_AMOUNT));

  return (
    <div className="rounded-3xl border border-white/12 bg-white/6 p-6 text-white shadow-2xl ring-1 ring-white/5 backdrop-blur-xl sm:p-9">
      <p className="eyebrow text-gold">{strings.eyebrow}</p>
      <p className="mt-6 text-sm text-white/65">{strings.line}</p>
      <output
        aria-live="polite"
        className="text-figure font-display mt-2 block tabular-nums"
      >
        {usd(line)}
      </output>
      <p className="text-sky mt-3 text-sm">
        {line >= MIN_AMOUNT ? strings.within : strings.below}
      </p>

      <div className="mt-8 space-y-7 border-t border-white/10 pt-7">
        <DollarSlider
          label={strings.homeValue}
          range={HOME_VALUE}
          value={home}
          onChange={setHome}
        />
        <DollarSlider
          label={strings.mortgageBalance}
          range={BALANCE}
          value={balance}
          onChange={setBalance}
        />
      </div>

      <a
        href={`${applyHref}?amount=${encodeURIComponent(amount)}`}
        data-apply=""
        data-amount={amount}
        className={cn(
          buttonVariants({ size: "hero", variant: "accent" }),
          "mt-8 w-full"
        )}
      >
        {strings.cta}
      </a>
      <p className="mt-5 text-center text-xs leading-relaxed text-white/50">
        {strings.note}
      </p>
    </div>
  );
};

export default EquityEstimator;
