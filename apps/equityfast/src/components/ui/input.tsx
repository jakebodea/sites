import { Input as InputPrimitive } from "@base-ui/react/input";
import * as React from "react";

import { cn } from "@/lib/utils";

// Site additions: `large` is the application form's roomy, bordered field;
// `compact` is the planner's small right-aligned dollar box.
const inputVariants = {
  compact:
    "border-border bg-paper text-navy h-10 w-28 shrink-0 rounded-lg text-right font-medium tabular-nums md:text-sm",
  default: "",
  large:
    "h-13 rounded-xl bg-white px-4 text-lg md:text-lg text-navy placeholder:text-slate-blue/50 focus-visible:border-sky-ink focus-visible:ring-sky/25 shadow-xs",
} as const;

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & { variant?: keyof typeof inputVariants }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        inputVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Input };
