import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UiStrings } from "@/i18n/ui";

import ApplicationForm from "./application-form";

interface ApplyDialogProps {
  readonly locale: "en" | "es";
  readonly strings: UiStrings;
  readonly turnstileSiteKey: string;
}

/** A left click with no modifier: anything else (new tab, new window) keeps the link's default. */
const isPlainClick = (event: MouseEvent) => {
  const modified =
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  return !event.defaultPrevented && event.button === 0 && !modified;
};

/**
 * The application dialog, mounted once per page. Every "Start" button is a
 * real link to the apply page (so it works before hydration and without
 * JavaScript); this intercepts those `[data-apply]` clicks and opens the
 * form in place, prefilled from the link's `data-amount` when it has one
 * (the estimator and the planner set it).
 */
const ApplyDialog = ({
  locale,
  strings,
  turnstileSiteKey,
}: ApplyDialogProps) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string | undefined>();
  // Remount the form per opening so a prefilled amount always applies.
  const [session, setSession] = useState(0);

  useEffect(() => {
    const show = (prefill: string | undefined) => {
      setAmount(prefill);
      setSession((current) => current + 1);
      setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      if (!isPlainClick(event)) {
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[data-apply]")
          : null;
      if (target === null) {
        return;
      }
      event.preventDefault();
      show(target.dataset.amount ?? undefined);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent variant="application" closeLabel={strings.close}>
        <p className="text-sky-ink eyebrow">{strings.applyEyebrow}</p>
        <DialogDescription className="sr-only">
          {strings.applyIntro}
        </DialogDescription>
        <ApplicationForm
          key={session}
          locale={locale}
          strings={strings}
          turnstileSiteKey={turnstileSiteKey}
          initialAmount={amount}
          homeHref={locale === "es" ? "/es" : "/"}
          onDone={() => {
            setOpen(false);
          }}
          renderTitle={(title) => (
            <DialogTitle variant="application" className="mt-2">
              {title}
            </DialogTitle>
          )}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ApplyDialog;
