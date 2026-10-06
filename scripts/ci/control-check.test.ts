import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { controlCheck } from "./control-check.ts";

const Report = Schema.fromJsonString(
  Schema.Struct({
    errors: Schema.Number,
    findings: Schema.Array(
      Schema.Struct({ detail: Schema.String, rule: Schema.String })
    ),
  })
);

describe(controlCheck, () => {
  it.each([true, false])(
    "preserves the real SEO report when passing is %s",
    async (valid) => {
      const output = mkdtempSync(path.join(tmpdir(), "seo-report-"));
      const server = createServer((request, response) => {
        const origin = `http://${request.headers.host}`;
        if (request.url === "/robots.txt") {
          response.end(
            `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
          );
        } else if (request.url === "/sitemap.xml") {
          response.end(`<urlset><url><loc>${origin}/</loc></url></urlset>`);
        } else {
          response.setHeader("content-type", "text/html");
          response.end(
            `<!doctype html><html><head><title>Fixture site</title><meta name="description" content="A complete description for a rendered site used to test the SEO command."><link rel="canonical" href="${origin}/"></head><body>${valid ? "<h1>Fixture page</h1>" : "<p>Missing heading</p>"}</body></html>`
          );
        }
      });
      try {
        server.listen(0, "localhost");
        await once(server, "listening");
        const address = Schema.decodeUnknownSync(
          Schema.Struct({ port: Schema.Number })
        )(server.address());
        const passed = await controlCheck({
          flags: ["--content-only"],
          name: "seo",
          origin: `http://localhost:${address.port}`,
          output,
          site: "jbolabs",
        });
        expect(passed).toBe(valid);
        const report = Schema.decodeUnknownSync(Report)(
          readFileSync(path.join(output, "jbolabs-seo.json"), "utf-8")
        );
        expect(report.errors).toBe(valid ? 0 : 1);
        expect(report.findings).toStrictEqual(
          valid ? [] : [{ detail: "0 <h1> elements", rule: "one-h1" }]
        );
      } finally {
        server.close();
        rmSync(output, { force: true, recursive: true });
      }
    }
  );
});
