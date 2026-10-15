import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SMOKE_FORM_FILE, pageVerdict, smokeForm } from "./smoke.ts";

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

const page = (body: string): string =>
  `<!doctype html><html><head><title>Home | EquityFast</title></head><body>${body}</body></html>`;

describe(pageVerdict, () => {
  it("passes a full page with a headline", () => {
    expect(
      pageVerdict(200, page('<main><h1 class="x">Hi</h1></main>'))
    ).toStrictEqual({
      detail: "HTTP 200",
      ok: true,
    });
  });

  it("fails a page whose layout rendered but whose content is empty", () => {
    expect(
      pageVerdict(
        200,
        page("<header>Menu</header><main></main><footer>Footer</footer>")
      )
    ).toStrictEqual({
      detail: "HTTP 200, no <h1>: page rendered no content",
      ok: false,
    });
  });

  it("fails a document cut off mid-stream", () => {
    expect(
      pageVerdict(
        200,
        "<!doctype html><html><head><title>Home</title></head><body><h1>Hi"
      )
    ).toStrictEqual({
      detail: "HTTP 200, incomplete HTML",
      ok: false,
    });
  });

  it("fails a complete page served with an error status", () => {
    expect(
      pageVerdict(500, page("<h1>Something went wrong</h1>"))
    ).toStrictEqual({
      detail: "HTTP 500",
      ok: false,
    });
  });
});
