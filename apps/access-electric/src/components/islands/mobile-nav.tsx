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
              aria-current={currentPath === item.url ? "page" : undefined}
              onClick={() => {
                setOpen(false);
              }}
              className="hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:text-navy flex min-h-12 items-center rounded-md px-3 text-base font-medium"
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
            Request a bid
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
