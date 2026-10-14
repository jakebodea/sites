import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { UiStrings } from "@/i18n/ui";
import { cn } from "@/lib/utils";

/** What the visitor sees once the application is in. */
const ApplicationSuccess = ({
  firstName,
  homeHref,
  onDone,
  renderTitle,
  strings,
}: {
  readonly firstName: string;
  readonly homeHref: string;
  readonly onDone: (() => void) | undefined;
  readonly renderTitle: (title: string) => ReactNode;
  readonly strings: UiStrings["form"];
}) => (
  <div className="py-4 text-center" aria-live="polite">
    <div className="bg-gold/25 mx-auto flex size-14 items-center justify-center rounded-full">
      <CheckIcon className="text-navy size-7" aria-hidden="true" />
    </div>
    <div className="mt-5">
      {renderTitle(
        firstName === ""
          ? strings.successTitleAnonymous
          : `${strings.successTitle}, ${firstName}.`
      )}
    </div>
    <p className="text-slate-blue mx-auto mt-3 max-w-sm text-lg leading-relaxed">
      {strings.successBody}
    </p>
    <p className="text-slate-blue mx-auto mt-4 max-w-sm text-sm">
      {strings.successNote}
    </p>
    {onDone === undefined ? (
      <a
        href={homeHref}
        className={cn(
          buttonVariants({ size: "hero", variant: "accent" }),
          "mt-7"
        )}
      >
        {strings.doneHome}
      </a>
    ) : (
      <Button
        type="button"
        variant="accent"
        size="hero"
        className="mt-7"
        onClick={onDone}
      >
        {strings.doneHome}
      </Button>
    )}
  </div>
);

export default ApplicationSuccess;
