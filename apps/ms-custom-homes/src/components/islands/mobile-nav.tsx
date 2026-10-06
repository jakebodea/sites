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
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly currentPath: string;
}

/** The financing partner and other off-site links open in a new tab. */
const EXTERNAL = /^https?:\/\//u;

/** Phone navigation. Hydrated only below the `md` breakpoint (`client:media`). */
const MobileNav = ({ currentPath, items, title }: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            className="-mr-2 md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <MenuIcon className="size-6" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" variant="flush" className="w-[86vw] max-w-sm">
        <SheetHeader divided>
          <SheetTitle brand>{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col p-3">
          {items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              {...(EXTERNAL.test(item.url)
                ? { rel: "noopener", target: "_blank" }
                : {})}
              aria-current={currentPath === item.url ? "page" : undefined}
              onClick={() => {
                setOpen(false);
              }}
              className="hover:bg-muted aria-[current=page]:text-brand font-display text-slate border-border/60 flex min-h-14 items-center border-b px-3 text-2xl"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="border-border pb-safe mt-auto border-t p-5">
          <a
            href="/contact"
            className={cn(buttonVariants({ size: "hero" }), "w-full")}
          >
            Start your project
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
