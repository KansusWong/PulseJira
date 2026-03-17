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
      defaultModel: process.env.LLM_MODEL_NAME || 'glm-5',
      modelMapping: buildDefaultModelMapping(primaryRequestedModel, process.env.LLM_MODEL_NAME),
      enabled: true,
      priority: 0,
      source: 'env-import',
      createdAt: new Date().toISOString(),
    });
  }

  if (process.env.DEEPSEEK_API_KEY && !dismissed.has('env-deepseek')) {
    const backupBaseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const deepseekThinking = process.env.DEEPSEEK_MODEL_NAME || 'deepseek-reasoner';
    const deepseekFast = process.env.DEEPSEEK_FAST_MODEL_NAME || 'deepseek-chat';
    accounts.push({
      id: 'env-deepseek',
      name: '备用模型 (环境变量)',
      provider: inferProvider(backupBaseURL),
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: backupBaseURL,
      defaultModel: deepseekThinking,
      modelMapping: buildDefaultModelMapping(primaryRequestedModel, deepseekThinking, deepseekFast),
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
  primaryModel: string | undefined,
  targetThinkingModel: string | undefined,
  targetFastModel?: string,
): ModelMapping | undefined {
  const source = String(primaryModel || '').trim();
  const thinkingTarget = String(targetThinkingModel || '').trim();
  const fastSource = String(process.env.AGENT_FAST_MODEL || '').trim();
  const fastTarget = String(targetFastModel || '').trim();

  const mapping: ModelMapping = {};

  // Map primary (thinking) model → target thinking model
  if (source && thinkingTarget && source.toLowerCase() !== thinkingTarget.toLowerCase()) {
    mapping[source] = thinkingTarget;
  }

  // Map fast model → target fast model
  if (fastSource && fastTarget && fastSource.toLowerCase() !== fastTarget.toLowerCase()) {
    mapping[fastSource] = fastTarget;
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}
