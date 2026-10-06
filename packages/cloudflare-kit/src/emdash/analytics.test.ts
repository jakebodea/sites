import { readFile } from "node:fs/promises";

import { Schema } from "effect";
import type { EncryptedPluginSetting } from "emdash";
import {
  decodePluginSettingValue,
  isEncryptedPluginSetting,
  resolvePluginEncryptionKeys,
} from "emdash";
import { describe, expect, it } from "vitest";

import type { KitEmDashEnv } from "../env.ts";
import {
  ANALYTICS_PLUGIN_ID,
  ANALYTICS_SETTING_KEYS,
  analyticsPlugin,
  reconcileAnalyticsPluginSettings,
} from "./analytics.ts";

const env: KitEmDashEnv = {
  ALERT_EMAIL: "",
  CF_ANALYTICS_API_TOKEN: "test-token",
  EMDASH_ENCRYPTION_KEY: `emdash_enc_v1_${btoa(String.fromCodePoint(...new Uint8Array(32).fill(7))).replaceAll("=", "")}`,
  LEAD_NOTIFY_FROM: "",
  LEAD_NOTIFY_FROM_NAME: "Test website",
  LEAD_NOTIFY_TO: "",
  WEB_ANALYTICS_ACCOUNT_ID: "account",
  WEB_ANALYTICS_HOSTS: "example.com,www.example.com",
  WEB_ANALYTICS_SITE_TAG: "tag",
  WEB_ANALYTICS_TOKEN: "beacon",
};
const key = (name: string): string => `plugin:analytics:settings:${name}`;
const memoryOptions = () => {
  const values = new Map<string, string | EncryptedPluginSetting>();
  const writes: Record<string, string | EncryptedPluginSetting>[] = [];
  const deletes: string[][] = [];
  return {
    deleteMany: async (names: string[]) => {
      deletes.push(names);
      for (const name of names) {
        values.delete(name);
      }
      return await Promise.resolve(names.length);
    },
    deletes,
    getMany: async () => await Promise.resolve(new Map(values)),
    setMany: async (
      updates: Record<string, string | EncryptedPluginSetting>
    ) => {
      writes.push(updates);
      for (const [name, value] of Object.entries(updates)) {
        values.set(name, value);
      }
      await Promise.resolve();
    },
    values,
    writes,
  };
};

describe("analytics settings reconciliation", () => {
  it("writes all settings on a fresh database, then writes nothing", async () => {
    const repo = memoryOptions();
    const first = await reconcileAnalyticsPluginSettings(repo, env);
    expect(first._tag).toBe("Written");
    expect(
      isEncryptedPluginSetting(repo.values.get(key("cfApiToken")))
    ).toBeTruthy();
    await expect(
      reconcileAnalyticsPluginSettings(repo, env)
    ).resolves.toStrictEqual({ _tag: "Unchanged" });
    expect(repo.writes).toHaveLength(1);
    expect(repo.deletes).toHaveLength(0);
  });

  it("rewrites a changed token by comparing decrypted plaintext", async () => {
    const repo = memoryOptions();
    await reconcileAnalyticsPluginSettings(repo, env);
    await reconcileAnalyticsPluginSettings(repo, {
      ...env,
      CF_ANALYTICS_API_TOKEN: "replacement",
    });
    expect(repo.writes).toHaveLength(2);
    expect(Object.keys(repo.writes[1] ?? {})).toStrictEqual([
      key("cfApiToken"),
    ]);
    const keys = await resolvePluginEncryptionKeys(env);
    await expect(
      decodePluginSettingValue(
        "analytics",
        "cfApiToken",
        repo.values.get(key("cfApiToken")),
        { cfApiToken: { label: "Token", type: "secret" } },
        keys
      )
    ).resolves.toBe("replacement");
  });

  it("encrypts plaintext settings and rewrites after encryption-key rotation", async () => {
    const repo = memoryOptions();
    repo.values.set(key("cfApiToken"), env.CF_ANALYTICS_API_TOKEN);
    await reconcileAnalyticsPluginSettings(repo, env);
    const oldEnvelope = repo.values.get(key("cfApiToken"));
    await reconcileAnalyticsPluginSettings(repo, {
      ...env,
      EMDASH_ENCRYPTION_KEY: `emdash_enc_v1_${btoa(String.fromCodePoint(...new Uint8Array(32).fill(8))).replaceAll("=", "")}`,
    });
    expect(repo.values.get(key("cfApiToken"))).not.toStrictEqual(oldEnvelope);
  });

  it("deletes Cloudflare keys in demo mode and restores them on production", async () => {
    const repo = memoryOptions();
    await reconcileAnalyticsPluginSettings(repo, env);
    await reconcileAnalyticsPluginSettings(repo, {
      ...env,
      WEB_ANALYTICS_TOKEN: "",
    });
    expect([...repo.values]).toStrictEqual([[key("provider"), "demo"]]);
    await expect(
      reconcileAnalyticsPluginSettings(repo, {
        ...env,
        WEB_ANALYTICS_TOKEN: "",
      })
    ).resolves.toStrictEqual({ _tag: "Unchanged" });
    await reconcileAnalyticsPluginSettings(repo, {
      ...env,
      CF_ANALYTICS_API_TOKEN: "",
    });
    expect(repo.values.size).toBe(4);
    expect(repo.values.get(key("provider"))).toBe("cloudflare");
    expect(repo.values.has(key("cfApiToken"))).toBeFalsy();
  });

  it("returns NotReady while the options table is missing", async () => {
    const repo = memoryOptions();
    const notReady = {
      ...repo,
      getMany: async () =>
        await Promise.reject(
          new Error("D1_ERROR: no such table: options: SQLITE_ERROR")
        ),
    };
    await expect(
      reconcileAnalyticsPluginSettings(notReady, env)
    ).resolves.toStrictEqual({ _tag: "NotReady" });
  });

  it("pins the plugin id and managed settings to its installed manifest", async () => {
    const manifestUrl = new URL(
      "manifest.json",
      import.meta.resolve("@eisbachcode/emdash-plugin-analytics")
    );
    const manifest = Schema.decodeUnknownSync(
      Schema.Struct({
        admin: Schema.Struct({
          settingsSchema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        id: Schema.String,
      })
    )(JSON.parse(await readFile(manifestUrl, "utf-8")));
    expect(analyticsPlugin.id).toBe(ANALYTICS_PLUGIN_ID);
    expect(manifest.id).toBe(ANALYTICS_PLUGIN_ID);
    expect(
      ANALYTICS_SETTING_KEYS.every(
        (name) => name in manifest.admin.settingsSchema
      )
    ).toBeTruthy();
  });
});
