/**
 * Applies a site's seed (CMS schema + starting content) to a fresh deployed
 * stage through EmDash's setup API, stopping before account creation. The
 * first person to finish setup in the admin still becomes the admin; the
 * stage just stops being empty, so previews can be smoke-tested and reviewed.
 */
import { Schema } from "effect";

import { request } from "./http.ts";

const SetupResponse = Schema.Struct({
  data: Schema.Struct({ seedComplete: Schema.optional(Schema.Boolean) }),
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

export const seedStage = async (origin: string): Promise<SeedResult> => {
  const statusResponse = await request(`${origin}/_emdash/api/setup/status`, {
    signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
  });
  const status = Schema.decodeUnknownSync(SetupStatus)(
    await statusResponse.json()
  );
  if (!status.data.needsSetup || status.data.step !== "start") {
    return {
      detail: `nothing to do (setup step: ${status.data.step ?? "complete"})`,
      seeded: false,
    };
  }
  const title = status.data.seedInfo?.title ?? "Site";
  const tagline = status.data.seedInfo?.tagline ?? "";
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = await request(`${origin}/_emdash/api/setup`, {
      body: JSON.stringify({ includeContent: true, tagline, title }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
      signal: AbortSignal.timeout(SETUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        detail: `setup API answered ${response.status}: ${await response.text()}`,
        seeded: false,
      };
    }
    const result = Schema.decodeUnknownSync(SetupResponse)(
      await response.json()
    );
    if (result.data.seedComplete === true) {
      return {
        detail: `seed applied in ${round} request(s); admin account still unclaimed`,
        seeded: true,
      };
    }
  }
  return {
    detail: `seed still incomplete after ${MAX_ROUNDS} requests`,
    seeded: false,
  };
};
