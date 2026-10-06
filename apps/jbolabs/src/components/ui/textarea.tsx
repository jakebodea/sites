import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"textarea"> & {
  /** Site addition: `lg` matches the intake form's roomy inputs. */
  size?: "default" | "lg";
}) {
  return (
    <textarea
      data-slot="textarea"
      data-size={size}
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-[size=lg]:bg-card flex field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 data-[size=lg]:min-h-40 data-[size=lg]:rounded-xl data-[size=lg]:px-4 data-[size=lg]:py-3 data-[size=lg]:leading-relaxed md:text-sm data-[size=lg]:md:text-[0.95rem]",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
