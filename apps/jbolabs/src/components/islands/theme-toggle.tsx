import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Key shared with the pre-paint script in `src/layouts/base.astro`. */
const STORAGE_KEY = "theme";

/**
 * Switches between light and dark. The icon follows the `.dark` class through
 * CSS, so the server render is correct before hydration and needs no state.
 */
const ThemeToggle = () => (
  <Button
    variant="ghost"
    size="icon-round"
    aria-label="Toggle dark mode"
    onClick={() => {
      const dark = document.documentElement.classList.toggle("dark");
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    }}
  >
    <SunIcon className="hidden size-[1.15rem] dark:block" aria-hidden="true" />
    <MoonIcon className="size-[1.15rem] dark:hidden" aria-hidden="true" />
  </Button>
);

export default ThemeToggle;
