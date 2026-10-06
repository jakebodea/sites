import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { request } from "../../packages/control-app/src/http.ts";
import { localWorker } from "./local-worker.ts";

describe(localWorker, () => {
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
