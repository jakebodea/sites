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

export type KitEnv = WebAnalyticsEnv & LeadMailEnv;
export type KitEmDashEnv = KitEnv & EmDashSecretsEnv;
