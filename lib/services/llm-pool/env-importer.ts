import type { LLMAccount, ModelMapping } from './types';

/**
 * Detect LLM accounts from environment variables.
 * Returns accounts that can be auto-imported into the pool.
 * Respects the dismissedEnvAccounts list to avoid re-importing removed accounts.
 */
export function detectEnvAccounts(dismissedIds: string[] = []): LLMAccount[] {
  const accounts: LLMAccount[] = [];
  const dismissed = new Set(dismissedIds);
  const primaryRequestedModel = String(process.env.LLM_MODEL_NAME || '').trim();

  if (process.env.OPENAI_API_KEY && !dismissed.has('env-primary')) {
    accounts.push({
      id: 'env-primary',
      name: '主账户 (环境变量)',
      provider: inferProvider(process.env.OPENAI_BASE_URL),
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      defaultModel: process.env.LLM_MODEL_NAME || 'gpt-4o',
      modelMapping: buildDefaultModelMapping(primaryRequestedModel, process.env.LLM_MODEL_NAME),
      enabled: true,
      priority: 0,
      source: 'env-import',
      createdAt: new Date().toISOString(),
    });
  }

  if (process.env.DEEPSEEK_API_KEY && !dismissed.has('env-deepseek')) {
    const backupBaseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    accounts.push({
      id: 'env-deepseek',
      name: '备用模型 (环境变量)',
      provider: inferProvider(backupBaseURL),
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: backupBaseURL,
      defaultModel: process.env.DEEPSEEK_MODEL_NAME || 'deepseek-reasoner',
      modelMapping: buildDefaultModelMapping(primaryRequestedModel, process.env.DEEPSEEK_MODEL_NAME || 'deepseek-reasoner'),
      enabled: true,
      priority: 10,
      tags: ['red-team'],
      source: 'env-import',
      createdAt: new Date().toISOString(),
    });
  }

  return accounts;
}

function inferProvider(baseURL?: string): string {
  if (!baseURL) return 'openai';
  const url = baseURL.toLowerCase();
  if (url.includes('bigmodel.cn')) return 'glm';
  if (url.includes('deepseek')) return 'deepseek';
  if (url.includes('openai')) return 'openai';
  return 'custom';
}

function buildDefaultModelMapping(
  requestedModel: string | undefined,
  targetModel: string | undefined,
): ModelMapping | undefined {
  const source = String(requestedModel || '').trim();
  const target = String(targetModel || '').trim();
  if (!source || !target || source.toLowerCase() === target.toLowerCase()) return undefined;
  return { [source]: target };
}
