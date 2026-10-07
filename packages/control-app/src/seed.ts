import { COMPLETION_PATH } from "@jakebodea/cloudflare-kit/emdash/published-content";
import { Schema } from "effect";

import { request } from "./http.ts";

const SetupResponse = Schema.Struct({
  data: Schema.Struct({ seedComplete: Schema.optional(Schema.Boolean) }),
});
const OwnerResponse = Schema.Struct({
  data: Schema.Struct({ ownerReady: Schema.Literal(true) }),
});
const SetupStatus = Schema.Struct({
  data: Schema.Struct({
    needsSetup: Schema.Boolean,
    seedInfo: Schema.optional(
      Schema.Struct({
        tagline: Schema.optional(Schema.String),
        title: Schema.String,
      })
    ),
    step: Schema.optional(Schema.String),
  }),
});

/** Large seeds apply across several requests (EmDash budgets each one). */
const MAX_ROUNDS = 30;
/**
 * The first setup request on a fresh stage runs EmDash's migrations and
 * downloads seed images, which can outlast the usual 20 s deadline. Aborting
 * it cancels the Worker while it holds the migration lock, and that lock never
 * expires: the stage then answers "EmDash is not initialized" until it is
 * destroyed and redeployed.
 */
const SETUP_TIMEOUT_MS = 180_000;

export interface SeedResult {
  readonly seeded: boolean;
  readonly detail: string;
}

const completeProductionContent = async (
  origin: string,
  headers: Headers
): Promise<void> => {
  let previousIndex = -1;
  let expectedTotal: number | undefined;
  while (true) {
    const completionResponse = await request(`${origin}${COMPLETION_PATH}`, {
      headers,
      method: "POST",
      signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
    });
    if (!completionResponse.ok) {
      throw new Error(
        `Published completion answered ${completionResponse.status}: ${await completionResponse.text()}`
      );
    }
    const completionResult = Schema.decodeUnknownSync(
      Schema.Struct({
        complete: Schema.Boolean,
        index: Schema.Number,
        total: Schema.Number,
      })
    )(await completionResponse.json());
    const { index, total } = completionResult;
    const valid = [
      [index, total].every(Number.isSafeInteger),
      [index >= 0, total >= 0, index <= total].every(Boolean),
      expectedTotal === undefined || total === expectedTotal,
      completionResult.complete ? index === total : index > previousIndex,
    ].every(Boolean);
    if (!valid) {
      throw new Error("Published completion did not make consistent progress");
    }
    if (completionResult.complete) {
      return;
    }
    previousIndex = index;
    expectedTotal = total;
  }
};

export const seedStage = async (
  origin: string,
  bootstrapToken: string | undefined = process.env.CMS_BOOTSTRAP_TOKEN,
  productionContent = false
): Promise<SeedResult> => {
  const headers = new Headers({ "content-type": "application/json", origin });
  if (bootstrapToken !== undefined) {
    headers.set("x-cms-bootstrap-token", bootstrapToken);
  }
  const finishOwner = async (): Promise<void> => {
    const response = await request(`${origin}/_emdash/api/setup/owner`, {
      headers,
      method: "POST",
      signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `CMS owner provisioning answered ${response.status}: ${await response.text()}`
      );
    }
    Schema.decodeUnknownSync(OwnerResponse)(await response.json());
  };
  const statusResponse = await request(`${origin}/_emdash/api/setup/status`, {
    signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
  });
  const status = Schema.decodeUnknownSync(SetupStatus)(
    await statusResponse.json()
  );
  if (!status.data.needsSetup || status.data.step !== "start") {
    if (productionContent && status.data.needsSetup) {
      await completeProductionContent(origin, headers);
    }
    await finishOwner();
    return {
      detail: productionContent
        ? "existing content preserved; production copy was not reloaded; studio owner verified"
        : "existing content preserved; studio owner verified",
      seeded: false,
    };
  }
  const title = status.data.seedInfo?.title ?? "Site";
  const tagline = status.data.seedInfo?.tagline ?? "";
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await request(`${origin}/_emdash/api/setup`, {
      body: JSON.stringify({ includeContent: true, tagline, title }),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `setup API answered ${response.status}: ${await response.text()}`
      );
    }
    const result = Schema.decodeUnknownSync(SetupResponse)(
      await response.json()
    );
    if (result.data.seedComplete === true) {
      if (productionContent) {
        await completeProductionContent(origin, headers);
      }
      await finishOwner();
      return {
        detail: `seed applied in ${round} request(s); studio owner reserved`,
        seeded: true,
      };
    }
  }
  throw new Error(`seed still incomplete after ${MAX_ROUNDS} requests`);
};
