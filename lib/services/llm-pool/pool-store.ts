import fs from 'fs';
import path from 'path';
import type {
  LLMPoolConfig,
  LLMAccount,
  RoutingStrategy,
  LLMPoolRuntimeConfig,
  LLMPoolFailoverPolicy,
} from './types';
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_FAILOVER_ON_TIMEOUT,
  DEFAULT_FAILOVER_ON_SERVER_ERROR,
  DEFAULT_FAILOVER_ON_MODEL_NOT_FOUND,
} from './types';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'llm-pool.json');

function coercePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function defaultFailoverPolicy(): LLMPoolFailoverPolicy {
  return {
    failoverOnTimeout: coerceBoolean(
      process.env.LLM_POOL_FAILOVER_ON_TIMEOUT,
      DEFAULT_FAILOVER_ON_TIMEOUT,
    ),
    failoverOnServerError: coerceBoolean(
      process.env.LLM_POOL_FAILOVER_ON_SERVER_ERROR,
      DEFAULT_FAILOVER_ON_SERVER_ERROR,
    ),
    failoverOnModelNotFound: coerceBoolean(
      process.env.LLM_POOL_FAILOVER_ON_MODEL_NOT_FOUND,
      DEFAULT_FAILOVER_ON_MODEL_NOT_FOUND,
    ),
  };
}

function defaultRuntimeConfig(): LLMPoolRuntimeConfig {
  return {
    failureThreshold: coercePositiveInt(
      process.env.LLM_POOL_FAILURE_THRESHOLD,
      DEFAULT_FAILURE_THRESHOLD,
    ),
    cooldownMs: coercePositiveInt(process.env.LLM_POOL_COOLDOWN_MS, DEFAULT_COOLDOWN_MS),
    failoverPolicy: defaultFailoverPolicy(),
  };
}

function resolveRuntimeConfig(raw: unknown): LLMPoolRuntimeConfig {
  const fallback = defaultRuntimeConfig();
  const value = raw as Partial<LLMPoolRuntimeConfig> | null | undefined;
  const failoverPolicy: Partial<LLMPoolFailoverPolicy> = value?.failoverPolicy || {};
  return {
    failureThreshold: coercePositiveInt(value?.failureThreshold, fallback.failureThreshold),
    cooldownMs: coercePositiveInt(value?.cooldownMs, fallback.cooldownMs),
    failoverPolicy: {
      failoverOnTimeout: coerceBoolean(
        failoverPolicy.failoverOnTimeout,
        fallback.failoverPolicy.failoverOnTimeout,
      ),
      failoverOnServerError: coerceBoolean(
        failoverPolicy.failoverOnServerError,
        fallback.failoverPolicy.failoverOnServerError,
      ),
      failoverOnModelNotFound: coerceBoolean(
        failoverPolicy.failoverOnModelNotFound,
        fallback.failoverPolicy.failoverOnModelNotFound,
      ),
    },
  };
}

const DEFAULT_CONFIG: LLMPoolConfig = {
  strategy: 'priority',
  accounts: [],
  dismissedEnvAccounts: [],
  runtimeConfig: defaultRuntimeConfig(),
};

export function readPoolConfig(): LLMPoolConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        strategy: parsed.strategy || 'priority',
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        dismissedEnvAccounts: Array.isArray(parsed.dismissedEnvAccounts) ? parsed.dismissedEnvAccounts : [],
        runtimeConfig: resolveRuntimeConfig(parsed.runtimeConfig),
      };
    }
  } catch (e) {
    console.warn('[llm-pool] Failed to read config, using defaults:', e);
  }
  return {
    ...DEFAULT_CONFIG,
    runtimeConfig: defaultRuntimeConfig(),
  };
}

export function writePoolConfig(config: LLMPoolConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(
      {
        ...config,
        runtimeConfig: resolveRuntimeConfig(config.runtimeConfig),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

export function upsertAccount(account: LLMAccount): void {
  const config = readPoolConfig();
  const idx = config.accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    config.accounts[idx] = account;
  } else {
    config.accounts.push(account);
  }
  writePoolConfig(config);
}

export function removeAccount(id: string): void {
  const config = readPoolConfig();
  const account = config.accounts.find((a) => a.id === id);
  config.accounts = config.accounts.filter((a) => a.id !== id);
  // Track dismissed env-import accounts so they don't get re-imported
  if (account?.source === 'env-import' && !config.dismissedEnvAccounts.includes(id)) {
    config.dismissedEnvAccounts.push(id);
  }
  writePoolConfig(config);
}

export function setStrategy(strategy: RoutingStrategy): void {
  const config = readPoolConfig();
  config.strategy = strategy;
  writePoolConfig(config);
}

export function setRuntimeConfig(partial: Partial<LLMPoolRuntimeConfig>): LLMPoolRuntimeConfig {
  const config = readPoolConfig();
  const mergedFailoverPolicy = {
    ...(config.runtimeConfig?.failoverPolicy || {}),
    ...(partial.failoverPolicy || {}),
  };
  config.runtimeConfig = resolveRuntimeConfig({
    ...config.runtimeConfig,
    ...partial,
    failoverPolicy: mergedFailoverPolicy,
  });
  writePoolConfig(config);
  return config.runtimeConfig;
}
