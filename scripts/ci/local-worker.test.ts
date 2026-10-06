import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { request } from "../../packages/control-app/src/http.ts";
import { localWorker } from "./local-worker.ts";

describe(localWorker, () => {
  it("keeps site data isolated across successive Worker lifecycles", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "local-isolation-"));
    const server = path.join(directory, "dist/server");
    mkdirSync(server, { recursive: true });
    mkdirSync(path.join(directory, "dist/client"), { recursive: true });
    writeFileSync(
      path.join(server, "entry.mjs"),
      `export default {
      async fetch(request, env) {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS entries (value TEXT)");
        if (request.method === "POST") {
          await env.DB.prepare("INSERT INTO entries VALUES (?)").bind("first site").run();
        }
        const result = await env.DB.prepare("SELECT COUNT(*) AS total FROM entries").first();
        return new Response(String(result.total));
      }
    };`
    );
    try {
      const first = await localWorker(directory, false);
      try {
        const response = await request(first.origin, { method: "POST" });
        await expect(response.text()).resolves.toBe("1");
      } finally {
        await first.runtime.dispose();
      }
      const second = await localWorker(directory, false);
      try {
        const response = await request(second.origin);
        await expect(response.text()).resolves.toBe("0");
      } finally {
        await second.runtime.dispose();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("serves seeded media from build assets without fetching its public origin", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "local-worker-"));
    const server = path.join(directory, "dist/server");
    const media = path.join(directory, "dist/client/_seed/media");
    mkdirSync(server, { recursive: true });
    mkdirSync(media, { recursive: true });
    const image =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    writeFileSync(path.join(media, "logo.svg"), image);
    writeFileSync(
      path.join(directory, "secret.svg"),
      "outside the asset directory"
    );
    writeFileSync(
      path.join(directory, ".build-inputs.json"),
      JSON.stringify({ seedMediaBase: "https://seed.example.invalid/media" })
    );
    writeFileSync(
      path.join(server, "entry.mjs"),
      `export default {
      async fetch(request) {
        const suffix = new URL(request.url).pathname === "/escape" ? "%2f..%2f..%2fsecret.svg" : "logo.svg";
        return await fetch("https://seed.example.invalid/media/" + suffix);
      }
    };`
    );
    let worker: Awaited<ReturnType<typeof localWorker>> | undefined;
    try {
      worker = await localWorker(directory, true);
      const response = await request(`${worker.origin}/seed`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
      await expect(response.text()).resolves.toBe(image);
      const escapedResponse = await request(`${worker.origin}/escape`);
      expect(escapedResponse.status).toBe(404);
    } finally {
      await worker?.runtime.dispose();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
