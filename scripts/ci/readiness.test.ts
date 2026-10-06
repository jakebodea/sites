import { once } from "node:events";
import { createServer } from "node:http";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { waitForDeployment } from "./readiness.ts";

const options = { attempts: 2, intervalMs: 1, timeoutMs: 1000 };

describe("deployment readiness", () => {
  it.each(["unavailable", "disconnected"])(
    "recovers from a temporarily %s origin",
    async (failure) => {
      let requests = 0;
      const server = createServer((request, response) => {
        requests += 1;
        if (requests === 1 && failure === "disconnected") {
          request.destroy();
          return;
        }
        response.writeHead(requests === 1 ? 503 : 200).end();
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const { port } = Schema.decodeUnknownSync(
        Schema.Struct({ port: Schema.Number })
      )(server.address());
      try {
        await waitForDeployment(`http://127.0.0.1:${port}`, options);
        expect(requests).toBe(2);
      } finally {
        server.closeAllConnections();
        await server[Symbol.asyncDispose]();
      }
    }
  );

  it("fails after the bounded attempts when the deployment stays unhealthy", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(503).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = Schema.decodeUnknownSync(
      Schema.Struct({ port: Schema.Number })
    )(server.address());
    try {
      await expect(
        waitForDeployment(`http://127.0.0.1:${port}`, options)
      ).rejects.toThrow("HTTP 503");
      expect(requests).toBe(2);
    } finally {
      server.closeAllConnections();
      await server[Symbol.asyncDispose]();
    }
  });
});
