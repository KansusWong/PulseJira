import OpenAI from 'openai';
import { createOpenAIClient } from '@/connectors/external/openai';
import { recordLlmUsage } from '@/lib/services/usage';
import { recordLlmFailoverEvent } from '@/lib/services/llm-failover-events';
import { getLLMPool, type ResolvedClient } from '@/lib/services/llm-pool';

// --- Module-level OpenAI client cache (#14, #16 TTL + capacity) ---
// Avoids creating new OpenAI instances for the same apiKey+baseUrl combination.
const CLIENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLIENT_CACHE_MAX_SIZE = 50;

const _clientCache = new Map<string, { client: OpenAI; createdAt: number }>();

function getCachedClient(apiKey?: string, baseUrl?: string): OpenAI {
  const cacheKey = `${apiKey || '__env__'}::${baseUrl || ''}`;
  const cached = _clientCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL_MS) {
    return cached.client;
  }
  // Evict expired entry
  if (cached) _clientCache.delete(cacheKey);
  // Evict oldest if at capacity
  if (_clientCache.size >= CLIENT_CACHE_MAX_SIZE) {
    const oldestKey = _clientCache.keys().next().value;
    if (oldestKey) _clientCache.delete(oldestKey);
  }
  const client = createOpenAIClient({ apiKey, baseURL: baseUrl });
  _clientCache.set(cacheKey, { client, createdAt: Date.now() });
  return client;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Retry a function with exponential backoff.
 * Only retries on transient network errors (ECONNRESET, fetch failed, socket hang up, etc.).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 1000, label = 'operation' } = {},
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isTransient = isTransientError(error);
      const isLastAttempt = attempt === maxRetries;

      if (!isTransient || isLastAttempt) throw error;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(
        `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms: ${error.message || error}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

function isTransientError(error: any): boolean {
  const msg = String(error?.message || error?.cause?.message || '').toLowerCase();
  const code = error?.code || error?.cause?.code || '';
  const status = getErrorStatusCode(error);
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('connection error') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    status === 408 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function getErrorStatusCode(error: any): number | null {
  const status =
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.cause?.status ??
    error?.cause?.statusCode ??
    error?.cause?.response?.status;

  return typeof status === 'number' ? status : null;
}

function getErrorCode(error: any): string | null {
  const code =
    error?.code ??
    error?.error?.code ??
    error?.response?.data?.error?.code ??
    error?.cause?.code ??
    error?.cause?.error?.code;

  if (code === undefined || code === null) return null;
  return String(code);
}

function getErrorMessage(error: any): string {
  return String(
    error?.message ||
      error?.error?.message ||
      error?.response?.data?.error?.message ||
      error?.cause?.message ||
      ''
  );
}

type FailoverPolicy = {
  failoverOnTimeout: boolean;
  failoverOnServerError: boolean;
  failoverOnModelNotFound: boolean;
};

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase();
}

function resolveModelForResolvedAccount(requestedModel: string, resolved: ResolvedClient): string {
  const modelMap = resolved.modelMapping || {};
  const requestedKey = normalizeModelName(requestedModel);

  for (const [source, target] of Object.entries(modelMap)) {
    if (!source || !target) continue;
    if (normalizeModelName(source) === requestedKey) return String(target).trim();
  }

  const wildcard = modelMap['*'] || modelMap.default || modelMap.DEFAULT;
  if (typeof wildcard === 'string' && wildcard.trim()) return wildcard.trim();

  return requestedModel;
}

/**
 * Quota / rate limit classifier used by pool failover.
 */
export function isQuotaOrRateLimitError(error: any): boolean {
  const status = getErrorStatusCode(error);
  const msg = getErrorMessage(error).toLowerCase();
  const code = String(error?.code || error?.error?.code || '').toLowerCase();

  return (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('insufficient_quota') ||
    msg.includes('quota exceeded') ||
    msg.includes('quota has been exceeded') ||
    msg.includes('billing hard limit') ||
    msg.includes('余额不足') ||
    msg.includes('额度不足') ||
    code === 'insufficient_quota' ||
    code === 'rate_limit_exceeded'
  );
}

function isTimeoutError(error: any): boolean {
  const status = getErrorStatusCode(error);
  const msg = getErrorMessage(error).toLowerCase();
  const code = String(error?.code || error?.cause?.code || '').toLowerCase();

  return (
    status === 408 ||
    code === 'etimedout' ||
    code === 'timeout' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('request timeout') ||
    msg.includes('abort')
  );
}

function isServerError(error: any): boolean {
  const status = getErrorStatusCode(error);
  return typeof status === 'number' && status >= 500 && status <= 599;
}

function isModelNotFoundError(error: any): boolean {
  const status = getErrorStatusCode(error);
  const code = (getErrorCode(error) || '').toLowerCase();
  const msg = getErrorMessage(error).toLowerCase();

  const codeMatch =
    code === 'model_not_found' ||
    code === 'no_such_model' ||
    code === 'invalid_model' ||
    code === 'unsupported_model';

  const messageMatch =
    msg.includes('model not found') ||
    msg.includes('no such model') ||
    msg.includes('unsupported model') ||
    msg.includes('invalid model') ||
    msg.includes('模型不存在') ||
    msg.includes('模型不可用') ||
    msg.includes('不支持该模型');

  return codeMatch || (status === 404 && messageMatch) || ((status === 400 || status === 422) && messageMatch);
}

function isFailoverEligibleError(error: any, policy: FailoverPolicy): boolean {
  if (isQuotaOrRateLimitError(error)) return true;
  if (policy.failoverOnTimeout && isTimeoutError(error)) return true;
  if (policy.failoverOnServerError && isServerError(error)) return true;
  if (policy.failoverOnModelNotFound && isModelNotFoundError(error)) return true;
  return false;
}

export async function withPoolFailover<T>(
  runner: (resolved: ResolvedClient) => Promise<T>,
  options: {
    tags?: string[];
    label?: string;
    maxSwitches?: number;
    projectId?: string | null;
    agentName?: string | null;
    model?: string | null;
  } = {}
): Promise<T> {
  const label = options.label || 'llm-call';
  const maxSwitches =
    typeof options.maxSwitches === 'number'
      ? Math.max(0, options.maxSwitches)
      : Math.max(0, Number(process.env.LLM_POOL_MAX_SWITCHES_PER_CALL || 2));

  const pool = getLLMPool();
  const runtimeConfig = pool.getRuntimeConfig();
  const failoverPolicy: FailoverPolicy = runtimeConfig.failoverPolicy;
  const candidates = pool.getFailoverChain({ tags: options.tags });
  const chain = candidates.length > 0 ? candidates : [pool.getClientOrFallback({ tags: options.tags })];

  let switches = 0;
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const resolved = chain[i];
    try {
      const result = await runner(resolved);
      pool.markAccountSuccess(resolved.accountId);
      return result;
    } catch (error: any) {
      lastError = error;
      const msg = getErrorMessage(error);
      const status = getErrorStatusCode(error);
      const code = getErrorCode(error);
      const eligible = isFailoverEligibleError(error, failoverPolicy);

      if (eligible) {
        pool.markAccountFailure(resolved.accountId, msg);
      }

      const hasNext = i < chain.length - 1;
      const canSwitch = eligible && hasNext && switches < maxSwitches;

      if (canSwitch) {
        const next = chain[i + 1];
        switches += 1;

        recordLlmFailoverEvent({
          projectId: options.projectId,
          agentName: options.agentName,
          model: options.model,
          eventType: 'switch',
          fromAccountId: resolved.accountId,
          fromAccountName: resolved.accountName,
          toAccountId: next.accountId,
          toAccountName: next.accountName,
          reason: msg,
          errorStatus: status,
          errorCode: code,
        }).catch((err) => console.error('[llm] Record failover switch event failed:', err));

        console.warn(
          `[llm-pool] ${label} switching account: ${resolved.accountName} -> ${next.accountName} (reason: ${msg || 'eligible failover'})`
        );
        continue;
      }

      if (eligible) {
        recordLlmFailoverEvent({
          projectId: options.projectId,
          agentName: options.agentName,
          model: options.model,
          eventType: 'exhausted',
          fromAccountId: resolved.accountId,
          fromAccountName: resolved.accountName,
          reason: msg,
          errorStatus: status,
          errorCode: code,
        }).catch((err) => console.error('[llm] Record failover exhausted event failed:', err));
      }

      throw error;
    }
  }

  throw (lastError || new Error(`[llm-pool] ${label} failed without specific error`));
}

// Helper to clean JSON string from Markdown code blocks and reasoning tags
export function cleanJSON(text: string): string {
  if (!text) return '{}';
  let clean = text.trim();

  // Remove <think>...</think> blocks from DeepSeek Reasoner
  clean = clean.replace(/<think>[\s\S]*?<\/think>/g, '');

  // 1. Try to extract Markdown code block (non-greedy)
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    clean = codeBlockMatch[1];
  }

  // 2. Extract the first balanced JSON object using brace counting (#24).
  //    The old greedy regex /\{[\s\S]*\}/ matched from the first { to the LAST },
  //    which produced invalid JSON when extra braces appeared after the object.
  const extracted = extractFirstJsonObject(clean);
  if (extracted) {
    clean = extracted;
  }

  return clean.trim();
}

/**
 * Find the first balanced `{ ... }` in the input by counting braces.
 * Correctly handles strings (ignores braces inside JSON string literals).
 * Returns null if no balanced object is found.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // No balanced closing brace found — fall back to greedy match
  const fallback = text.match(/\{[\s\S]*\}/);
  return fallback ? fallback[0] : null;
}

/**
 * Check if a model name refers to a "reasoner" model (e.g. deepseek-reasoner)
 * that doesn't support function calling or response_format.
 */
export function isReasonerModel(model: string | undefined | null): boolean {
  return !!model && model.includes('reasoner');
}

async function invokeJSONCall(params: {
  client: OpenAI;
  systemPrompt: string;
  userContent: string;
  model: string;
  accountId: string;
  accountName: string;
    options: {
      onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string; duration_ms?: number }) => void;
      agentName?: string;
      projectId?: string | null;
      signalId?: string | null;
      traceId?: string | null;
    };
}): Promise<any> {
  const isReasoner = isReasonerModel(params.model);

  const callLLM = async () => {
    const completionParams: any = {
      model: params.model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userContent }
      ]
    };

    if (!isReasoner) {
      completionParams.response_format = { type: 'json_object' };
    }

    const completionStartAt = Date.now();
    const completion = await params.client.chat.completions.create(completionParams);
    const durationMs = Date.now() - completionStartAt;
    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new LLMError(
        `LLM returned empty content (model: ${params.model})`,
        params.model,
      );
    }

    const usage = completion.usage;
    if (usage) {
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

      // Auto-record to DB (skip if caller provided onUsage to avoid double-write)
      if (!params.options.onUsage) {
        recordLlmUsage({
          agentName: params.options.agentName || 'unknown',
          projectId: params.options.projectId ?? null,
          model: params.model,
          promptTokens,
          completionTokens,
          durationMs,
          accountId: params.accountId,
          accountName: params.accountName,
          signalId: params.options.signalId ?? null,
          traceId: params.options.traceId ?? null,
        }).catch((err) => console.error('[llm] Record usage failed:', err));
      }

      if (params.options.onUsage) {
        params.options.onUsage({
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          model: params.model,
          duration_ms: durationMs,
        });
      }
    }

    const cleanedContent = cleanJSON(content);

    try {
      return JSON.parse(cleanedContent);
    } catch (parseError) {
      throw new LLMError(
        `Failed to parse LLM response as JSON (model: ${params.model}). Raw: ${content.slice(0, 200)}`,
        params.model,
        parseError,
      );
    }
  };

  return withRetry(callLLM, { label: `generateJSON(${params.model})` });
}

export async function generateJSON(
  systemPrompt: string,
  userContent: string,
  options: {
    model?: string,
    client?: OpenAI,
    baseUrl?: string,
    apiKey?: string,
    /** Called after a successful completion with token usage (if API returns it). */
    onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string; duration_ms?: number }) => void,
    /** Agent name for automatic usage tracking (defaults to 'unknown'). */
    agentName?: string,
    /** Project ID for automatic usage tracking. */
    projectId?: string | null,
    /** Pool account ID (when client is provided externally). */
    accountId?: string,
    /** Pool account name (when client is provided externally). */
    accountName?: string,
    /** Tags for pool-based account routing. */
    poolTags?: string[],
    /** Signal ID for per-signal cost tracking (#23). */
    signalId?: string | null,
    /** Trace ID for observability (#22). */
    traceId?: string | null,
  } = {}
) {
  const defaultModel = options.model || process.env.LLM_MODEL_NAME || 'gpt-4o';

  // Explicit client/apiKey path: no pool failover.
  if (options.client || options.apiKey) {
    const client = options.client || getCachedClient(options.apiKey, options.baseUrl);
    const accountId = options.accountId || '__env__';
    const accountName = options.accountName || 'Environment Default';

    try {
      return await invokeJSONCall({
        client,
        systemPrompt,
        userContent,
        model: defaultModel,
        accountId,
        accountName,
        options,
      });
    } catch (error) {
      if (error instanceof LLMError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new LLMError(`LLM API call failed (model: ${defaultModel}): ${msg}`, defaultModel, error);
    }
  }

  // Pool path: quota/rate-limit failover across accounts.
  try {
    return await withPoolFailover(
      async (resolved) => {
        const requestedModel = options.model || process.env.LLM_MODEL_NAME || 'gpt-4o';
        const model = resolveModelForResolvedAccount(requestedModel, resolved);
        return invokeJSONCall({
          client: resolved.client,
          systemPrompt,
          userContent,
          model,
          accountId: resolved.accountId,
          accountName: resolved.accountName,
          options,
        });
      },
      {
        tags: options.poolTags,
        label: `generateJSON(${defaultModel})`,
        projectId: options.projectId,
        agentName: options.agentName,
        model: defaultModel,
      }
    );
  } catch (error) {
    if (error instanceof LLMError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new LLMError(`LLM API call failed (model: ${defaultModel}): ${msg}`, defaultModel, error);
  }
}
