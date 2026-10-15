/**
 * The Assistant: a button in the admin's top bar that opens a side panel. The
 * panel is non-modal, so the editor stays usable while the assistant works.
 */
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { AssistantChat } from "#assistant/assistant-chat.tsx";
import { useHeaderSlot } from "#assistant/hooks/use-header-slot.ts";
import { usePathname } from "#assistant/hooks/use-location.ts";
import { openEntryFromPath } from "#assistant/open-entry.ts";
import { Button } from "#assistant/ui/button.tsx";
import { Sheet, SheetContent } from "#assistant/ui/sheet.tsx";
import { TooltipProvider } from "#assistant/ui/tooltip.tsx";

import type { PanelConfig } from "../assistant/protocol.ts";

export const Assistant = ({
  config,
  host,
}: {
  readonly config: PanelConfig;
  /** The Assistant's own root element; the panel mounts inside it so its styles apply. */
  readonly host: HTMLElement;
}) => {
  const [open, setOpen] = useState(false);
  const slot = useHeaderSlot();
  const entry = openEntryFromPath(usePathname());

  return (
    <TooltipProvider>
      {slot !== null &&
        createPortal(
          <Button
            aria-expanded={open}
            onClick={() => {
              setOpen((value) => !value);
            }}
            size="sm"
            variant={open ? "secondary" : "ghost"}
          >
            <SparklesIcon data-icon="inline-start" />
            Assistant
          </Button>,
          slot
        )}
      <Sheet
        disablePointerDismissal
        modal={false}
        onOpenChange={setOpen}
        open={open}
      >
        <SheetContent
          className="w-full sm:max-w-md"
          container={host}
          showOverlay={false}
        >
          <AssistantChat config={config} entry={entry} />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
};
