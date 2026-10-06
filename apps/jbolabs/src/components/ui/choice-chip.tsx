import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A native checkbox or radio dressed as a pill (site addition). The input
 * stays in the DOM, visually hidden, so forms, keyboard, and screen readers
 * work without JavaScript state.
 */
function ChoiceChip({
  className,
  children,
  type = "checkbox",
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  type?: "checkbox" | "radio";
}) {
  return (
    <label
      data-slot="choice-chip"
      className={cn(
        "border-input bg-card text-foreground/80 hover:border-foreground/30 has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-ring/50 inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors select-none has-focus-visible:ring-3 has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className
      )}
    >
      <input type={type} className="sr-only" {...props} />
      {children}
    </label>
  );
}

export { ChoiceChip };
