import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SMOKE_FORM_FILE, smokeForm } from "./smoke.ts";

const siteDirectory = (fixture?: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "smoke-form-"));
  if (fixture !== undefined) {
    writeFileSync(path.join(directory, SMOKE_FORM_FILE), fixture);
  }
  return directory;
};

describe(smokeForm, () => {
  it("submits the shared contact form when the site ships no fixture", () => {
    expect(smokeForm(siteDirectory())).toMatchObject({
      action: "contact",
      page: "/contact",
    });
  });

  it("uses the action, body, and page a site declares", () => {
    const form = smokeForm(
      siteDirectory(
        '{ "action": "apply", "body": { "amount": "$75,000" }, "page": "/apply" }'
      )
    );
    expect(form).toStrictEqual({
      action: "apply",
      body: { amount: "$75,000" },
      page: "/apply",
    });
  });

  it("rejects a fixture without an action", () => {
    expect(() =>
      smokeForm(siteDirectory('{ "body": {}, "page": "/apply" }'))
    ).toThrow("action");
  });

  it("rejects a page that is not a site path", () => {
    expect(() =>
      smokeForm(
        siteDirectory('{ "action": "apply", "body": {}, "page": "apply" }')
      )
    ).toThrow("page");
  });
});
