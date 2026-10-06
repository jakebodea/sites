import { RuleTester } from "oxlint/plugins-dev";
import { describe, test } from "vitest";

import {
  noLongDashesRule,
  noTransitionColorsRule,
  preferSharedControlsRule,
} from "./oxlint-plugin-local.ts";

RuleTester.describe = describe;
RuleTester.it = test;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-transition-colors", noTransitionColorsRule, {
  invalid: [
    {
      code: `<a className="text-sm transition-colors hover:text-white" />`,
      errors: [{ messageId: "transitionColors" }],
    },
    {
      code: `<a class={cn("px-2", "hover:transition-colors")} />`,
      errors: [{ messageId: "transitionColors" }],
    },
    {
      code: `const button = cva("inline-flex transition-colors");`,
      errors: [{ messageId: "transitionColors" }],
    },
  ],
  valid: [
    { code: `<a className="transition-transform hover:-translate-y-px" />` },
    { code: `<a class="text-primary hover:text-primary/80" />` },
    { code: `const x = cn("transition-opacity", active && "opacity-100");` },
  ],
});

tester.run("prefer-shared-controls", preferSharedControlsRule, {
  invalid: [
    {
      code: `<button type="button" className="rounded px-3">Menu</button>`,
      errors: [{ messageId: "raw" }],
    },
    { code: `<input name="email" />`, errors: [{ messageId: "raw" }] },
    { code: `<textarea name="message" />`, errors: [{ messageId: "raw" }] },
  ],
  valid: [
    { code: `<Button type="submit">Send</Button>` },
    { code: `<input type="hidden" name="source" value="contact" />` },
    {
      code: `<button className="rounded" />`,
      filename: "/repo/apps/site/src/components/ui/button.tsx",
    },
  ],
});

tester.run("no-long-dashes", noLongDashesRule, {
  invalid: [
    {
      code: `<p>Quality work — on schedule.</p>`,
      errors: [{ messageId: "dash" }],
    },
    {
      code: `const title = "Projects – Access Electric";`,
      errors: [{ messageId: "dash" }],
    },
    {
      code: "const copy = `Built right — every time`;",
      errors: [{ messageId: "dash" }],
    },
  ],
  valid: [
    { code: `<p>Serving Southern California since 2001.</p>` },
    { code: `const title = "Projects - Access Electric";` },
    { code: "const range = `2001-2026`;" },
  ],
});
