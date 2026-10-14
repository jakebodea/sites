import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly label: string;
  readonly url: string;
}

interface MobileNavProps {
  readonly items: readonly NavItem[];
  readonly currentPath: string;
  readonly applyHref: string;
  readonly switchHref: string;
  readonly switchLocale: string;
  readonly strings: {
    readonly close: string;
    readonly menu: string;
    readonly mainNav: string;
    readonly startNow: string;
    readonly switchTo: string;
  };
}

/**
 * Phone and tablet navigation. Hydrated only below the `xl` breakpoint
 * (`client:media`). The apply link carries `data-apply`, so the application
 * dialog opens over the drawer's page once the drawer closes.
 */
const MobileNav = ({
  applyHref,
  currentPath,
  items,
  strings,
  switchHref,
  switchLocale,
}: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost-inverse"
            size="icon-lg"
            className="-mr-2 ml-1 xl:hidden"
            aria-label={strings.menu}
          />
        }
      >
        <MenuIcon className="size-6" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="right"
        variant="flush"
        closeLabel={strings.close}
        className="w-[86vw] max-w-sm"
      >
        <SheetHeader divided>
          <SheetTitle brand>EquityFast</SheetTitle>
          <SheetDescription className="sr-only">
            {strings.mainNav}
          </SheetDescription>
        </SheetHeader>
        <nav aria-label={strings.mainNav} className="flex flex-col p-3">
          {items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              aria-current={currentPath === item.url ? "page" : undefined}
              onClick={close}
              className="hover:bg-muted aria-[current=page]:bg-mist text-navy font-display flex min-h-12 items-center rounded-xl px-3 text-2xl"
            >
              {item.label}
            </a>
          ))}
          <a
            href={switchHref}
            hrefLang={switchLocale}
            lang={switchLocale}
            className="text-sky-ink hover:bg-muted mt-2 flex min-h-12 items-center rounded-xl px-3 text-sm font-medium"
          >
            {strings.switchTo}
          </a>
        </nav>
        <div className="border-border pb-safe mt-auto border-t p-5">
          <a
            href={applyHref}
            data-apply=""
            onClick={close}
            className={cn(
              buttonVariants({ size: "hero", variant: "accent" }),
              "w-full"
            )}
          >
            {strings.startNow}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
