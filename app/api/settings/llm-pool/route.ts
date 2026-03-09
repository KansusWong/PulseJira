/**
 * LLM Pool account management API.
 *
 * GET    — List all accounts (apiKeys masked), strategy, and detected env accounts.
 * POST   — Create or update an account.
 * DELETE  — Remove an account by id.
 * PATCH  — Update strategy, runtime config, or account state.
 */

import { NextResponse } from 'next/server';
import {
  readPoolConfig,
  writePoolConfig,
  upsertAccount,
  removeAccount,
  setStrategy,
  setRuntimeConfig,
} from '@/lib/services/llm-pool/pool-store';
import { detectEnvAccounts } from '@/lib/services/llm-pool/env-importer';
import { getLLMPool } from '@/lib/services/llm-pool';
import type {
  LLMAccount,
  RoutingStrategy,
  LLMPoolRuntimeConfig,
  LLMPoolFailoverPolicy,
  ModelMapping,
} from '@/lib/services/llm-pool/types';
import { listRecentLlmFailoverEvents } from '@/lib/services/llm-failover-events';
import {
  buildApiKeyEnvRef,
  getAccountApiKeyEnvName,
  parseApiKeyEnvRef,
  resolveApiKey,
  upsertEnvLocalSecret,
} from '@/lib/services/llm-pool/secret-store';

function maskApiKey(key: string): string {
  if (!key) return '';
  const envName = parseApiKeyEnvRef(key);
  if (envName) return `env:${envName}`;
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function maskAccount(account: LLMAccount): Omit<LLMAccount, 'apiKey'> & { maskedApiKey: string } {
  const { apiKey, ...rest } = account;
  return { ...rest, maskedApiKey: maskApiKey(apiKey) };
}

function normalizeModelMapping(value: unknown): ModelMapping | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: ModelMapping = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const source = String(k || '').trim();
    const target = String(v || '').trim();
    if (!source || !target) continue;
    out[source] = target;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function ensureCustomModelMapping(
  requestedModel: string | undefined,
  defaultModel: string | undefined,
  currentMapping?: ModelMapping,
): ModelMapping | undefined {
  const request = String(requestedModel || '').trim();
  const target = String(defaultModel || '').trim();
  if (!request || !target || request.toLowerCase() === target.toLowerCase()) return currentMapping;

  const mapping: ModelMapping = { ...(currentMapping || {}) };
  const existing = Object.entries(mapping).find(
    ([source]) => source.trim().toLowerCase() === request.toLowerCase(),
  );
  if (!existing) {
    mapping[request] = target;
  }
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function extractModelIds(payload: any): string[] {
  const out = new Set<string>();

  const pushModelId = (value: unknown) => {
    const id = String(value || '').trim();
    if (id) out.add(id);
  };

  const candidates = [
    payload?.data,
    payload?.models,
    payload?.result?.data,
    payload?.result?.models,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === 'string') {
        pushModelId(item);
      } else if (item && typeof item === 'object') {
        pushModelId((item as any).id);
        pushModelId((item as any).model);
        pushModelId((item as any).name);
      }
    }
  }

  return [...out];
}

function containsModel(modelList: string[], model: string): boolean {
  const needle = model.trim().toLowerCase();
  return modelList.some((item) => item.toLowerCase() === needle);
}

function pickDetectedModel(modelList: string[]): string | undefined {
  const prefers = ['moonshot', 'kimi', 'chat', 'gpt', 'glm', 'deepseek'];
  for (const keyword of prefers) {
    const matched = modelList.find((m) => m.toLowerCase().includes(keyword));
    if (matched) return matched;
  }
  return modelList[0];
}

async function probeCustomAccount(input: {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  modelMapping?: ModelMapping;
}): Promise<{ availableModels: string[]; detectedDefaultModel?: string }> {
  const baseURL = String(input.baseURL || '').trim();
  if (!baseURL) {
    throw new Error('custom provider 必须填写 Base URL');
  }

  const normalized = baseURL.replace(/\/+$/, '');
  const modelCandidates = uniqueNonEmptyStrings([
    `${normalized}/models`,
    normalized.endsWith('/v1') ? '' : `${normalized}/v1/models`,
  ]);

  let lastError = '';
  for (const modelUrl of modelCandidates) {
    try {
      const res = await fetch(modelUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: `Bearer ${input.apiKey}`,
          'User-Agent': 'LLM-Pool-Validator/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const text = await res.text();
        lastError = `${modelUrl} HTTP ${res.status}: ${text.slice(0, 120)}`;
        continue;
      }

      const raw = await res.text();
      let payload: any;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        lastError = `${modelUrl} 返回非 JSON`;
        continue;
      }

      const availableModels = extractModelIds(payload);
      if (availableModels.length === 0) {
        lastError = `${modelUrl} 未返回可识别模型列表`;
        continue;
      }

      const defaultModel = String(input.defaultModel || '').trim();
      if (defaultModel && !containsModel(availableModels, defaultModel)) {
        throw new Error(
          `默认模型 "${defaultModel}" 不在该 custom provider 的可用模型中（共 ${availableModels.length} 个）`,
        );
      }

      if (input.modelMapping) {
        const invalidTargets = Object.values(input.modelMapping).filter(
          (target) => !containsModel(availableModels, target),
        );
        if (invalidTargets.length > 0) {
          throw new Error(
            `模型映射目标不存在：${invalidTargets.join(', ')}`,
          );
        }
      }

      return {
        availableModels,
        detectedDefaultModel: defaultModel || pickDetectedModel(availableModels),
      };
    } catch (error: any) {
      lastError = error?.message || '连接失败';
    }
  }

  throw new Error(`custom provider 连通性/模型探测失败：${lastError || '未知错误'}`);
}

export async function GET() {
  try {
    const config = readPoolConfig();
    const envDetected = detectEnvAccounts(config.dismissedEnvAccounts);
    const pool = getLLMPool();
    const recentFailoverEvents = await listRecentLlmFailoverEvents(20);

    // Determine which env accounts are not yet imported
    const existingIds = new Set(config.accounts.map((a) => a.id));
    const unimportedEnv = envDetected.filter((e) => !existingIds.has(e.id));

    return NextResponse.json({
      success: true,
      data: {
        strategy: config.strategy,
        accounts: config.accounts.map(maskAccount),
        unimportedEnv: unimportedEnv.map(maskAccount),
        runtimeConfig: pool.getRuntimeConfig(),
        health: pool.getHealthStatus(),
        recentFailoverEvents,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { account } = body as { account: LLMAccount };

    if (!account || !account.id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 },
      );
    }

    // Handle env-import: resolve actual API key from environment
    let resolvedApiKey = resolveApiKey(account.apiKey);
    let storedApiKey = account.apiKey;
    let apiKeyEnvVarName: string | null = null;
    if (resolvedApiKey === '__import_from_env__') {
      const config = readPoolConfig();
      const envAccounts = detectEnvAccounts(config.dismissedEnvAccounts);
      const envAccount = envAccounts.find((e) => e.id === account.id);
      if (!envAccount) {
        return NextResponse.json(
          { success: false, error: `Environment account ${account.id} not found` },
          { status: 404 },
        );
      }
      resolvedApiKey = envAccount.apiKey;
      // Also inherit other env-detected fields
      account.name = account.name || envAccount.name;
      account.provider = account.provider || envAccount.provider;
      account.baseURL = account.baseURL || envAccount.baseURL;
      account.defaultModel = account.defaultModel || envAccount.defaultModel;
      account.modelMapping = account.modelMapping || envAccount.modelMapping;
      account.tags = account.tags?.length ? account.tags : envAccount.tags;
      account.priority = typeof account.priority === 'number' ? account.priority : envAccount.priority;
      account.source = 'env-import';
      storedApiKey = resolvedApiKey;
    } else {
      const inputEnvName = parseApiKeyEnvRef(account.apiKey);
      if (inputEnvName) {
        storedApiKey = buildApiKeyEnvRef(inputEnvName);
        apiKeyEnvVarName = inputEnvName;
      }
    }

    if (!resolvedApiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: apiKey（或环境变量未生效）' },
        { status: 400 },
      );
    }

    const provider = account.provider || 'custom';
    let normalizedModelMapping = normalizeModelMapping(account.modelMapping);
    let resolvedDefaultModel = String(account.defaultModel || '').trim() || undefined;
    let probeMeta: { availableModels: string[]; detectedDefaultModel?: string } | null = null;
    let probeWarning: string | null = null;

    if (provider === 'custom' && account.source !== 'env-import') {
      if (!String(account.baseURL || '').trim()) {
        return NextResponse.json(
          { success: false, error: 'custom provider 必须填写 Base URL' },
          { status: 400 },
        );
      }

      if (!parseApiKeyEnvRef(storedApiKey)) {
        const envVarName = getAccountApiKeyEnvName(account.id);
        upsertEnvLocalSecret(envVarName, resolvedApiKey);
        storedApiKey = buildApiKeyEnvRef(envVarName);
        apiKeyEnvVarName = envVarName;
      }

      try {
        probeMeta = await probeCustomAccount({
          apiKey: resolvedApiKey,
          baseURL: account.baseURL,
          defaultModel: resolvedDefaultModel,
          modelMapping: normalizedModelMapping,
        });

        resolvedDefaultModel = resolvedDefaultModel || probeMeta.detectedDefaultModel;
      } catch (e: any) {
        probeWarning = e?.message || 'custom provider 连通性探测失败';
        console.warn(`[llm-pool] custom account probe failed: ${account.id}`, probeWarning);
      }
    }

    normalizedModelMapping = ensureCustomModelMapping(
      process.env.LLM_MODEL_NAME,
      resolvedDefaultModel,
      normalizedModelMapping,
    );

    const toSave: LLMAccount = {
      id: account.id,
      name: account.name || 'Unnamed',
      provider,
      apiKey: storedApiKey,
      baseURL: account.baseURL || undefined,
      defaultModel: resolvedDefaultModel,
      modelMapping: normalizedModelMapping,
      enabled: account.enabled !== false,
      priority: typeof account.priority === 'number' ? account.priority : 10,
      tags: Array.isArray(account.tags) ? account.tags : [],
      source: account.source || 'user',
      createdAt: account.createdAt || new Date().toISOString(),
    };

    upsertAccount(toSave);
    getLLMPool().reload();

    return NextResponse.json({
      success: true,
      data: {
        detectedDefaultModel: probeMeta?.detectedDefaultModel || resolvedDefaultModel || null,
        availableModels: probeMeta?.availableModels || null,
        probeWarning,
        apiKeyEnvVarName,
      },
    });
  } catch (e: any) {
    const message = e?.message || '请求失败';
    const badRequestHints = ['Missing required field', 'custom provider', '默认模型', '模型映射', 'Base URL'];
    const status = badRequestHints.some((hint) => message.includes(hint)) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing query param: id' },
        { status: 400 },
      );
    }

    removeAccount(id);
    getLLMPool().reload();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    // Update runtime config
    if (body.runtimeConfig && typeof body.runtimeConfig === 'object') {
      const patch: Partial<LLMPoolRuntimeConfig> & {
        failoverPolicy?: Partial<LLMPoolFailoverPolicy>;
      } = {};
      const runtime = body.runtimeConfig as Partial<LLMPoolRuntimeConfig>;

      if (Object.prototype.hasOwnProperty.call(runtime, 'failureThreshold')) {
        const n = Number(runtime.failureThreshold);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { success: false, error: 'runtimeConfig.failureThreshold must be a positive number' },
            { status: 400 },
          );
        }
        patch.failureThreshold = Math.floor(n);
      }

      if (Object.prototype.hasOwnProperty.call(runtime, 'cooldownMs')) {
        const n = Number(runtime.cooldownMs);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { success: false, error: 'runtimeConfig.cooldownMs must be a positive number' },
            { status: 400 },
          );
        }
        patch.cooldownMs = Math.floor(n);
      }

      if (runtime.failoverPolicy && typeof runtime.failoverPolicy === 'object') {
        const failoverPatch: Partial<LLMPoolFailoverPolicy> = {};
        const failover = runtime.failoverPolicy as Partial<LLMPoolFailoverPolicy>;

        if (Object.prototype.hasOwnProperty.call(failover, 'failoverOnTimeout')) {
          if (typeof failover.failoverOnTimeout !== 'boolean') {
            return NextResponse.json(
              { success: false, error: 'runtimeConfig.failoverPolicy.failoverOnTimeout must be boolean' },
              { status: 400 },
            );
          }
          failoverPatch.failoverOnTimeout = failover.failoverOnTimeout;
        }

        if (Object.prototype.hasOwnProperty.call(failover, 'failoverOnServerError')) {
          if (typeof failover.failoverOnServerError !== 'boolean') {
            return NextResponse.json(
              { success: false, error: 'runtimeConfig.failoverPolicy.failoverOnServerError must be boolean' },
              { status: 400 },
            );
          }
          failoverPatch.failoverOnServerError = failover.failoverOnServerError;
        }

        if (Object.prototype.hasOwnProperty.call(failover, 'failoverOnModelNotFound')) {
          if (typeof failover.failoverOnModelNotFound !== 'boolean') {
            return NextResponse.json(
              { success: false, error: 'runtimeConfig.failoverPolicy.failoverOnModelNotFound must be boolean' },
              { status: 400 },
            );
          }
          failoverPatch.failoverOnModelNotFound = failover.failoverOnModelNotFound;
        }

        if (Object.keys(failoverPatch).length > 0) {
          (patch as Record<string, unknown>).failoverPolicy = failoverPatch;
        }
      }

      if (Object.keys(patch).length === 0) {
        return NextResponse.json(
          { success: false, error: 'No valid runtimeConfig fields provided' },
          { status: 400 },
        );
      }

      const updated = setRuntimeConfig(patch as Partial<LLMPoolRuntimeConfig>);
      getLLMPool().reload();
      return NextResponse.json({
        success: true,
        data: {
          runtimeConfig: updated,
        },
      });
    }

    // Update strategy
    if (body.strategy) {
      const s = body.strategy as RoutingStrategy;
      if (s !== 'priority' && s !== 'round-robin') {
        return NextResponse.json(
          { success: false, error: `Invalid strategy: ${s}` },
          { status: 400 },
        );
      }
      setStrategy(s);
      getLLMPool().reload();
      return NextResponse.json({ success: true });
    }

    // Toggle account enabled/disabled
    if (body.accountId && typeof body.enabled === 'boolean') {
      const config = readPoolConfig();
      const account = config.accounts.find((a) => a.id === body.accountId);
      if (!account) {
        return NextResponse.json(
          { success: false, error: `Account not found: ${body.accountId}` },
          { status: 404 },
        );
      }
      account.enabled = body.enabled;
      writePoolConfig(config);
      getLLMPool().reload();
      return NextResponse.json({ success: true });
    }

    // Update account priority
    if (body.accountId && typeof body.priority === 'number') {
      const config = readPoolConfig();
      const account = config.accounts.find((a) => a.id === body.accountId);
      if (!account) {
        return NextResponse.json(
          { success: false, error: `Account not found: ${body.accountId}` },
          { status: 404 },
        );
      }
      account.priority = body.priority;
      writePoolConfig(config);
      getLLMPool().reload();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: 'No valid update fields provided' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
