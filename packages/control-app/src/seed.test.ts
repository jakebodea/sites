import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { seedStage } from "./seed.ts";

const withSetupServer = async (
  handle: (request: IncomingMessage, response: ServerResponse) => void,
  check: (origin: string) => Promise<void>
): Promise<void> => {
  const server = createServer(handle);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = Schema.decodeUnknownSync(
    Schema.Struct({ port: Schema.Number })
  )(server.address());
  try {
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await server[Symbol.asyncDispose]();
  }
};

const json = (
  response: ServerResponse,
  data: {
    readonly needsSetup?: boolean;
    readonly step?: string;
    readonly seedComplete?: boolean;
    readonly ownerReady?: boolean;
  }
): void => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ data }));
};

describe("seed ownership verification", () => {
  it("fails a deployment when native seeding fails", async () => {
    await withSetupServer(
      (request, response) => {
        if (request.url?.endsWith("/status") === true) {
          json(response, { needsSetup: true, step: "start" });
        } else {
          response.writeHead(503).end("unavailable");
        }
      },
      async (origin) => {
        await expect(seedStage(origin, "test-token")).rejects.toThrow("503");
      }
    );
  });

  it("fails when seeding never completes", async () => {
    await withSetupServer(
      (request, response) => {
        json(
          response,
          request.url?.endsWith("/status") === true
            ? { needsSetup: true, step: "start" }
            : { seedComplete: false }
        );
      },
      async (origin) => {
        await expect(seedStage(origin, "test-token")).rejects.toThrow(
          "still incomplete"
        );
      }
    );
  });

  it("preserves completed content and still requires a ready owner", async () => {
    await withSetupServer(
      (request, response) => {
        if (request.url?.endsWith("/status") === true) {
          json(response, { needsSetup: false });
        } else {
          response.writeHead(409).end("ownership conflict");
        }
      },
      async (origin) => {
        await expect(seedStage(origin, "test-token")).rejects.toThrow("409");
      }
    );
  });

  it("accepts an already provisioned site without reseeding", async () => {
    await withSetupServer(
      (request, response) => {
        if (request.url?.endsWith("/status") === true) {
          json(response, { needsSetup: false });
        } else if (request.url?.endsWith("/owner") === true) {
          json(response, { ownerReady: true });
        } else {
          response.writeHead(500).end("Unexpected reseed");
        }
      },
      async (origin) => {
        await expect(seedStage(origin, "test-token")).resolves.toMatchObject({
          seeded: false,
        });
      }
    );
  });
});
