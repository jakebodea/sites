import { Option, Redacted } from "effect";
import {
  OptionsRepository,
  decodePluginSettingValue,
  encryptPluginSetting,
  isEncryptedPluginSetting,
  resolvePluginEncryptionKeys,
} from "emdash";
import type { EncryptedPluginSetting } from "emdash";

import type { KitEmDashEnv } from "../env.ts";
import { webAnalyticsFromEnv } from "../web-analytics.ts";
import type { AnalyticsPluginSettings } from "./analytics-settings.ts";

export { default as analyticsPlugin } from "@eisbachcode/emdash-plugin-analytics";

export const ANALYTICS_PLUGIN_ID = "analytics";
export const ANALYTICS_SETTING_KEYS = [
  "provider",
  "cfApiToken",
  "cfAccountId",
  "cfSiteTag",
  "hosts",
] as const;
const optionKey = (key: string): string =>
  `plugin:${ANALYTICS_PLUGIN_ID}:settings:${key}`;

export type SyncResult =
  | { readonly _tag: "Unchanged" }
  | { readonly _tag: "Written"; readonly keys: readonly string[] }
  | { readonly _tag: "NotReady" };
interface SettingsRepository {
  readonly getMany: (
    ...args: Parameters<OptionsRepository["getMany"]>
  ) => ReturnType<OptionsRepository["getMany"]>;
  readonly setMany: (
    values: Record<string, string | EncryptedPluginSetting>
  ) => Promise<void>;
  readonly deleteMany: OptionsRepository["deleteMany"];
}
const OPTIONS_MISSING = /no such table: (?:main\.)?options/u;
type StoredSetting = Awaited<ReturnType<OptionsRepository["get"]>>;
const tokenSetting = async (
  stored: StoredSetting,
  token: Redacted.Redacted,
  env: KitEmDashEnv
): Promise<EncryptedPluginSetting | undefined> => {
  const keys = await resolvePluginEncryptionKeys({
    EMDASH_ENCRYPTION_KEY: env.EMDASH_ENCRYPTION_KEY,
  });
  if (isEncryptedPluginSetting(stored) && stored.kid === keys?.[0]?.kid) {
    try {
      const plaintext = await decodePluginSettingValue(
        ANALYTICS_PLUGIN_ID,
        "cfApiToken",
        stored,
        { cfApiToken: { label: "Cloudflare API token", type: "secret" } },
        keys
      );
      if (plaintext === Redacted.value(token)) {
        return undefined;
      }
    } catch {
      /* A rotated or damaged envelope must be replaced from the binding. */
    }
  }
  return await encryptPluginSetting(
    ANALYTICS_PLUGIN_ID,
    "cfApiToken",
    Redacted.value(token),
    keys
  );
};

const desiredPluginSettings = (env: KitEmDashEnv): AnalyticsPluginSettings =>
  Option.match(webAnalyticsFromEnv(env), {
    onNone: () => ({ provider: "demo" }),
    onSome: (value) => ({
      cfAccountId: value.accountId,
      cfApiToken: value.apiToken,
      cfSiteTag: value.siteTag,
      hosts: value.hosts.join(","),
      provider: "cloudflare",
    }),
  });

const reconcileOptions = async (
  repo: SettingsRepository,
  env: KitEmDashEnv,
  current: Awaited<ReturnType<OptionsRepository["getMany"]>>
): Promise<SyncResult> => {
  const desired = desiredPluginSettings(env);
  const plain: Record<string, string> =
    desired.provider === "demo"
      ? { provider: "demo" }
      : {
          cfAccountId: desired.cfAccountId,
          cfSiteTag: desired.cfSiteTag,
          hosts: desired.hosts,
          provider: desired.provider,
        };
  const writes: Record<string, string | EncryptedPluginSetting> = {};
  const deletes: string[] = [];
  for (const key of ANALYTICS_SETTING_KEYS) {
    if (key === "cfApiToken") {
      continue;
    }
    const fullKey = optionKey(key);
    const value = plain[key];
    if (value !== undefined) {
      if (current.get(fullKey) !== value) {
        writes[fullKey] = value;
      }
    } else if (current.has(fullKey)) {
      deletes.push(fullKey);
    }
  }
  const tokenKey = optionKey("cfApiToken");
  if (desired.provider === "cloudflare" && Option.isSome(desired.cfApiToken)) {
    const encrypted = await tokenSetting(
      current.get(tokenKey),
      desired.cfApiToken.value,
      env
    );
    if (encrypted !== undefined) {
      writes[tokenKey] = encrypted;
    }
  } else if (current.has(tokenKey)) {
    deletes.push(tokenKey);
  }
  if (Object.keys(writes).length > 0) {
    await repo.setMany(writes);
  }
  if (deletes.length > 0) {
    await repo.deleteMany(deletes);
  }
  const changed = [...Object.keys(writes), ...deletes];
  return changed.length === 0
    ? { _tag: "Unchanged" }
    : { _tag: "Written", keys: changed };
};

export const reconcileAnalyticsPluginSettings = async (
  repo: SettingsRepository,
  env: KitEmDashEnv
): Promise<SyncResult> => {
  try {
    const current = await repo.getMany(ANALYTICS_SETTING_KEYS.map(optionKey));
    return await reconcileOptions(repo, env, current);
  } catch (error) {
    if (error instanceof Error && OPTIONS_MISSING.test(error.message)) {
      return { _tag: "NotReady" };
    }
    throw error;
  }
};

export const syncAnalyticsPluginSettings = async (
  env: KitEmDashEnv
): Promise<SyncResult> => {
  try {
    const { withEmDashRuntime } = await import("emdash/middleware");
    return await withEmDashRuntime(
      async (runtime) =>
        await reconcileAnalyticsPluginSettings(
          new OptionsRepository(runtime.db),
          env
        )
    );
  } catch (error) {
    if (error instanceof Error && OPTIONS_MISSING.test(error.message)) {
      return { _tag: "NotReady" };
    }
    throw error;
  }
};
