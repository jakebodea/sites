/** Empty analytics bindings disable measurement outside production. */
export interface WebAnalyticsEnv {
  readonly WEB_ANALYTICS_TOKEN: string;
  readonly WEB_ANALYTICS_SITE_TAG: string;
  readonly WEB_ANALYTICS_ACCOUNT_ID: string;
  readonly WEB_ANALYTICS_HOSTS: string;
  readonly CF_ANALYTICS_API_TOKEN: string;
}

export interface LeadMailEnv {
  readonly LEAD_NOTIFY_FROM: string;
  readonly LEAD_NOTIFY_FROM_NAME: string;
  readonly LEAD_NOTIFY_TO: string;
  readonly ALERT_EMAIL: string;
}

export interface EmDashSecretsEnv {
  readonly EMDASH_ENCRYPTION_KEY: string;
}

/**
 * The CMS assistant's model (see `assistantAi`); `AI` is unbound in offline local dev.
 * Typed by the one method the assistant calls, so this module needs no workers-types.
 */
export interface AssistantEnv {
  readonly AI?: { readonly run: (...args: never[]) => Promise<object> };
  readonly AI_GATEWAY_ID: string;
}

export type KitEnv = WebAnalyticsEnv & LeadMailEnv;
export type KitEmDashEnv = KitEnv & EmDashSecretsEnv;
