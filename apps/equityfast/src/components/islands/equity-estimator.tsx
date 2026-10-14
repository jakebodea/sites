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
        <span
          id={id}
          className="tracking-label text-xs font-semibold text-white/75 uppercase"
        >
          {label}
        </span>
        <span className="text-lg font-semibold tabular-nums">{usd(value)}</span>
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
    <div className="border border-white/15 bg-white/8 p-6 text-white shadow-2xl backdrop-blur-md sm:p-8">
      <p className="tracking-label text-xs font-semibold text-white/75 uppercase">
        {strings.line}
      </p>
      <output
        aria-live="polite"
        className="text-figure mt-1 block font-semibold tabular-nums"
      >
        {usd(line)}
      </output>
      <p className="text-sky mt-2 text-sm font-semibold">
        {line >= MIN_AMOUNT ? strings.within : strings.below}
      </p>

      <div className="mt-7 space-y-6">
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
      <p className="mt-4 text-center text-xs leading-relaxed text-white/70">
        {strings.note}
      </p>
    </div>
  );
};

export default EquityEstimator;
