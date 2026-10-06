import { Schema } from "effect";
import { OptionsRepository, UserRepository } from "emdash";

import { ADMIN_ROLE, OwnershipError } from "./owner-policy.ts";
import type { OwnerConfig } from "./owner-policy.ts";

type Database = ConstructorParameters<typeof UserRepository>[0];
const Receipt = Schema.Struct({ studioOwner: Schema.String });
const SeedState = Schema.Struct({
  step: Schema.String,
  tagline: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
});
const receiptKey = async (config: OwnerConfig) =>
  await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.CMS_BOOTSTRAP_TOKEN),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"]
  );
const receiptPayload = (
  config: OwnerConfig,
  id: string
): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    JSON.stringify([
      "cms-owner-v1",
      config.CMS_OWNER_SITE,
      config.STAGE,
      config.CMS_OWNER_EMAIL.toLowerCase(),
      id,
    ])
  );
const receiptSignature = async (
  config: OwnerConfig,
  id: string
): Promise<string> => {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await receiptKey(config),
    receiptPayload(config, id)
  );
  return btoa(String.fromCodePoint(...new Uint8Array(signature)));
};
const validReceipt = async (
  config: OwnerConfig,
  user: Awaited<ReturnType<UserRepository["findById"]>>
): Promise<boolean> => {
  if (user === null || user.data === null) {
    return false;
  }
  try {
    const receipt = Schema.decodeUnknownSync(Receipt)(user.data);
    const signature = Uint8Array.from(
      atob(receipt.studioOwner),
      (char) => char.codePointAt(0) ?? 0
    );
    return await crypto.subtle.verify(
      "HMAC",
      await receiptKey(config),
      signature,
      receiptPayload(config, user.id)
    );
  } catch {
    return false;
  }
};

export const isProvisionedOwner = async (
  db: Database,
  config: OwnerConfig,
  id: string
): Promise<boolean> => {
  const user = await new UserRepository(db).findById(id);
  return (
    user?.role === ADMIN_ROLE &&
    user.email.toLowerCase() === config.CMS_OWNER_EMAIL.toLowerCase() &&
    (await validReceipt(config, user))
  );
};

export const provisionOwner = async (
  db: Database,
  config: OwnerConfig
): Promise<{ readonly ownerReady: true }> => {
  const options = new OptionsRepository(db);
  const users = new UserRepository(db);
  const email = config.CMS_OWNER_EMAIL.toLowerCase();
  const [complete, state, existingOwner] = await Promise.all([
    options.get("emdash:setup_complete"),
    options.get("emdash:setup_state"),
    users.findByEmail(email),
  ]);
  let owner = existingOwner;
  const setupComplete = complete === true || complete === "true";
  if (owner === null && (setupComplete || (await users.count()) > 0)) {
    owner = await users.findByEmail(email);
    if (owner === null) {
      throw new OwnershipError({
        message: "Existing CMS accounts require a reviewed owner migration.",
      });
    }
  }
  if (owner === null) {
    const seed = Schema.decodeUnknownSync(SeedState)(state);
    if (seed.step !== "site_complete") {
      throw new OwnershipError({
        message: "Finish content seeding before provisioning the owner.",
      });
    }
    const id = crypto.randomUUID();
    await db
      .insertInto("users")
      .values({
        avatar_url: null,
        data: JSON.stringify({
          studioOwner: await receiptSignature(config, id),
        }),
        email,
        email_verified: 0,
        id,
        name: "Jake Bodea",
        role: ADMIN_ROLE,
      })
      .onConflict((conflict) => conflict.column("email").doNothing())
      .execute();
    owner = await users.findByEmail(email);
  }
  if (!(await validReceipt(config, owner)) || owner?.role !== ADMIN_ROLE) {
    throw new OwnershipError({
      message: "The owner account does not match its provisioning receipt.",
    });
  }
  const [row, otherAdmin] = await Promise.all([
    db
      .selectFrom("users")
      .select("disabled")
      .where("id", "=", owner.id)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("users")
      .select("id")
      .where("role", ">", 40)
      .where("id", "!=", owner.id)
      .executeTakeFirst(),
  ]);
  if (row.disabled !== 0 || otherAdmin !== undefined) {
    throw new OwnershipError({
      message: "CMS ownership conflicts with existing account state.",
    });
  }
  if (complete !== true && complete !== "true") {
    const seed = Schema.decodeUnknownSync(SeedState)(state);
    if (seed.step !== "site_complete") {
      throw new OwnershipError({
        message: "Content seed completion is not persisted.",
      });
    }
    if (seed.title !== undefined) {
      await options.setIfAbsent("emdash:site_title", seed.title);
    }
    if (seed.tagline !== undefined) {
      await options.setIfAbsent("emdash:site_tagline", seed.tagline);
    }
    await options.set("emdash:setup_complete", true);
  }
  return { ownerReady: true };
};
