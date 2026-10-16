import type * as React from "react";

import { cn } from "#assistant/lib/utils.ts";

/** A column of starter prompts, after AI Elements' Suggestions, stacked for a narrow panel. */
function Suggestions({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="suggestions"
      className={cn("-mx-2 flex flex-col", className)}
      {...props}
    />
  );
}

function Suggestion({
  className,
  icon,
  children,
  ...props
}: React.ComponentProps<"button"> & { readonly icon?: React.ReactNode }) {
  return (
    <li>
      <button
        data-slot="suggestion"
        type="button"
        className={cn(
          "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
          className
        )}
        {...props}
      >
        {icon}
        <span className="min-w-0">{children}</span>
      </button>
    </li>
  );
}

export { Suggestion, Suggestions };
