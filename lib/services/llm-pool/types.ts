import type OpenAI from 'openai';

export type RoutingStrategy = 'priority' | 'round-robin';
export type HealthStatus = 'healthy' | 'cooldown' | 'disabled';

export const DEFAULT_FAILURE_THRESHOLD = 2;
export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
export const DEFAULT_FAILOVER_ON_TIMEOUT = true;
export const DEFAULT_FAILOVER_ON_SERVER_ERROR = true;
export const DEFAULT_FAILOVER_ON_MODEL_NOT_FOUND = true;

export interface LLMPoolFailoverPolicy {
  failoverOnTimeout: boolean;
  failoverOnServerError: boolean;
  failoverOnModelNotFound: boolean;
}

export type ModelMapping = Record<string, string>;

export interface LLMAccount {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  /** Per-account model mapping: requested model -> actual model for this account. */
  modelMapping?: ModelMapping;
  enabled: boolean;
  priority: number;
  tags?: string[];
  source: 'user' | 'env-import';
  createdAt: string;
}

export interface LLMPoolRuntimeConfig {
  failureThreshold: number;
  cooldownMs: number;
  failoverPolicy: LLMPoolFailoverPolicy;
}

export interface LLMPoolConfig {
  strategy: RoutingStrategy;
  accounts: LLMAccount[];
  dismissedEnvAccounts: string[];
  runtimeConfig: LLMPoolRuntimeConfig;
}

export interface LLMAccountHealth {
  accountId: string;
  accountName: string;
  enabled: boolean;
  status: HealthStatus;
  consecutiveFailures: number;
  inCooldown: boolean;
  cooldownUntil: string | null;
  cooldownRemainingMs: number;
  lastError: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}

export interface ResolvedClient {
  client: OpenAI;
  accountId: string;
  accountName: string;
  provider?: string;
  model?: string;
  modelMapping?: ModelMapping;
}
