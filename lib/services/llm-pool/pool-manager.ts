import OpenAI from 'openai';
import type {
  LLMAccount,
  LLMPoolConfig,
  ResolvedClient,
  RoutingStrategy,
  LLMPoolRuntimeConfig,
  LLMAccountHealth,
} from './types';
import { readPoolConfig } from './pool-store';
import { detectEnvAccounts } from './env-importer';
import { createOpenAIClient } from '@/connectors/external/openai';
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_FAILOVER_ON_TIMEOUT,
  DEFAULT_FAILOVER_ON_SERVER_ERROR,
  DEFAULT_FAILOVER_ON_MODEL_NOT_FOUND,
} from './types';
import { resolveApiKey } from './secret-store';

interface GetClientOptions {
  tags?: string[];
  accountId?: string;
}

type AccountRuntimeState = {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastError?: string;
  lastFailureAt?: string;
  lastSuccessAt?: string;
};

class LLMPoolManager {
  private config: LLMPoolConfig | null = null;
  private roundRobinIndex = 0;
  private clientCache = new Map<string, OpenAI>();
  private runtimeState = new Map<string, AccountRuntimeState>();

  private ensureLoaded(): LLMPoolConfig {
    if (!this.config) {
      const diskConfig = readPoolConfig();

      // Merge env-imported accounts that aren't already in the config
      const envAccounts = detectEnvAccounts(diskConfig.dismissedEnvAccounts);
      const existingIds = new Set(diskConfig.accounts.map((a) => a.id));
      for (const env of envAccounts) {
        if (!existingIds.has(env.id)) {
          diskConfig.accounts.push(env);
        } else {
          // Refresh env-import accounts with latest env var values
          const idx = diskConfig.accounts.findIndex((a) => a.id === env.id);
          if (idx >= 0 && diskConfig.accounts[idx].source === 'env-import') {
            diskConfig.accounts[idx] = {
              ...diskConfig.accounts[idx],
              apiKey: env.apiKey,
              baseURL: env.baseURL,
              defaultModel: env.defaultModel,
            };
          }
        }
      }

      this.config = diskConfig;
    }
    return this.config;
  }

  /** Reload config from disk (call after settings change). */
  reload(): void {
    this.config = null;
    this.clientCache.clear();
  }

  /** Get an OpenAI client from the pool based on strategy and filters. */
  getClient(options?: GetClientOptions): ResolvedClient | null {
    const candidates = this.getFailoverChain(options);
    if (candidates.length === 0) return null;
    return candidates[0];
  }

  /**
   * Return ordered candidates for failover.
   * Accounts in cooldown are excluded unless all accounts are in cooldown.
   */
  getFailoverChain(options?: GetClientOptions): ResolvedClient[] {
    const config = this.ensureLoaded();
    const allCandidates = this.filterCandidates(config.accounts, options);
    if (allCandidates.length === 0) return [];

    const now = Date.now();
    const healthyCandidates = allCandidates.filter((a) => {
      const state = this.runtimeState.get(a.id);
      return !state || state.cooldownUntil <= now;
    });

    const selectedPool = healthyCandidates.length > 0 ? healthyCandidates : allCandidates;
    const ordered = this.orderCandidates(selectedPool, config.strategy);

    return ordered.map((account) => ({
      client: this.getOrCreateClient(account),
      accountId: account.id,
      accountName: account.name,
      provider: account.provider,
      model: account.defaultModel,
      modelMapping: account.modelMapping,
    }));
  }

  markAccountFailure(accountId: string, errorMessage?: string): void {
    if (!accountId || accountId.startsWith('__')) return;

    const nowIso = new Date().toISOString();
    const state = this.runtimeState.get(accountId) || {
      consecutiveFailures: 0,
      cooldownUntil: 0,
    };

    state.consecutiveFailures += 1;
    state.lastFailureAt = nowIso;
    state.lastError = errorMessage;

    if (state.consecutiveFailures >= this.getFailureThreshold()) {
      state.cooldownUntil = Date.now() + this.getCooldownMs();
      state.consecutiveFailures = 0;
    }

    this.runtimeState.set(accountId, state);
  }

  markAccountSuccess(accountId: string): void {
    if (!accountId || accountId.startsWith('__')) return;

    const state = this.runtimeState.get(accountId) || {
      consecutiveFailures: 0,
      cooldownUntil: 0,
    };

    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = undefined;

    this.runtimeState.set(accountId, state);
  }

  getStrategy(): RoutingStrategy {
    return this.ensureLoaded().strategy;
  }

  getAccounts(): LLMAccount[] {
    return this.ensureLoaded().accounts;
  }

  getRuntimeConfig(): LLMPoolRuntimeConfig {
    const config = this.ensureLoaded();
    return {
      failureThreshold: this.coercePositiveInt(
        config.runtimeConfig?.failureThreshold,
        DEFAULT_FAILURE_THRESHOLD,
      ),
      cooldownMs: this.coercePositiveInt(config.runtimeConfig?.cooldownMs, DEFAULT_COOLDOWN_MS),
      failoverPolicy: {
        failoverOnTimeout: this.coerceBoolean(
          config.runtimeConfig?.failoverPolicy?.failoverOnTimeout,
          DEFAULT_FAILOVER_ON_TIMEOUT,
        ),
        failoverOnServerError: this.coerceBoolean(
          config.runtimeConfig?.failoverPolicy?.failoverOnServerError,
          DEFAULT_FAILOVER_ON_SERVER_ERROR,
        ),
        failoverOnModelNotFound: this.coerceBoolean(
          config.runtimeConfig?.failoverPolicy?.failoverOnModelNotFound,
          DEFAULT_FAILOVER_ON_MODEL_NOT_FOUND,
        ),
      },
    };
  }

  getHealthStatus(): LLMAccountHealth[] {
    const accounts = this.ensureLoaded().accounts;
    const now = Date.now();

    return accounts.map((account) => {
      const state = this.runtimeState.get(account.id);
      const cooldownUntil = state?.cooldownUntil || 0;
      const inCooldown = cooldownUntil > now;

      const status = !account.enabled ? 'disabled' : inCooldown ? 'cooldown' : 'healthy';

      return {
        accountId: account.id,
        accountName: account.name,
        enabled: account.enabled,
        status,
        consecutiveFailures: state?.consecutiveFailures || 0,
        inCooldown,
        cooldownUntil: cooldownUntil > 0 ? new Date(cooldownUntil).toISOString() : null,
        cooldownRemainingMs: inCooldown ? cooldownUntil - now : 0,
        lastError: state?.lastError || null,
        lastFailureAt: state?.lastFailureAt || null,
        lastSuccessAt: state?.lastSuccessAt || null,
      };
    });
  }

  /**
   * Get a client from the pool, or fall back to env-var-based client.
   * Always returns a valid client.
   */
  getClientOrFallback(options?: GetClientOptions): ResolvedClient {
    const resolved = this.getClient(options);
    if (resolved) return resolved;

    // Fallback: use raw env vars via the existing factory
    try {
      return {
        client: createOpenAIClient(),
        accountId: '__env__',
        accountName: 'Environment Default',
        model: process.env.LLM_MODEL_NAME || 'gpt-4o',
      };
    } catch {
      // If even env vars aren't configured, return a dummy that will fail on first call
      return {
        client: new OpenAI({ apiKey: 'not-configured' }),
        accountId: '__none__',
        accountName: 'Not Configured',
      };
    }
  }

  private filterCandidates(accounts: LLMAccount[], options?: GetClientOptions): LLMAccount[] {
    let candidates = accounts.filter((a) => a.enabled);

    if (options?.accountId) {
      const exact = candidates.find((a) => a.id === options.accountId);
      return exact ? [exact] : [];
    }

    if (options?.tags && options.tags.length > 0) {
      candidates = candidates.filter((a) =>
        options.tags!.some((tag) => a.tags?.includes(tag))
      );
    }

    return candidates;
  }

  private orderCandidates(candidates: LLMAccount[], strategy: RoutingStrategy): LLMAccount[] {
    if (candidates.length === 0) return [];

    switch (strategy) {
      case 'round-robin': {
        const base = [...candidates];
        const start = this.roundRobinIndex % base.length;
        this.roundRobinIndex += 1;
        return [...base.slice(start), ...base.slice(0, start)];
      }
      case 'priority':
      default: {
        return [...candidates].sort((a, b) => a.priority - b.priority);
      }
    }
  }

  private getFailureThreshold(): number {
    return this.getRuntimeConfig().failureThreshold;
  }

  private getCooldownMs(): number {
    return this.getRuntimeConfig().cooldownMs;
  }

  private coercePositiveInt(value: unknown, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  private coerceBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    return fallback;
  }

  private getOrCreateClient(account: LLMAccount): OpenAI {
    const cached = this.clientCache.get(account.id);
    if (cached) return cached;

    const apiKey = resolveApiKey(account.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: account.baseURL || undefined,
    });
    this.clientCache.set(account.id, client);
    return client;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: LLMPoolManager | null = null;

export function getLLMPool(): LLMPoolManager {
  if (!_instance) _instance = new LLMPoolManager();
  return _instance;
}

export function resetLLMPool(): void {
  _instance = null;
}
