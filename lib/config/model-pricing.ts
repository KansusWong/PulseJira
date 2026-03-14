/**
 * Model pricing configuration for cost tracking (#23).
 * Prices are in USD per 1M tokens. Update as provider prices change.
 */

export interface ModelPricing {
  promptPer1M: number;
  completionPer1M: number;
}

/**
 * Known model pricing (USD per 1M tokens).
 * Sources: OpenAI pricing page, DeepSeek pricing page (as of 2025-05).
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4.1 family
  'gpt-4.1': { promptPer1M: 2.0, completionPer1M: 8.0 },
  'gpt-4.1-mini': { promptPer1M: 0.4, completionPer1M: 1.6 },
  'gpt-4.1-nano': { promptPer1M: 0.02, completionPer1M: 0.15 },
  // GPT-4o family
  'gpt-4o': { promptPer1M: 2.5, completionPer1M: 10 },
  'gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
  // GPT-4 legacy
  'gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
  'gpt-4': { promptPer1M: 30, completionPer1M: 60 },
  'gpt-3.5-turbo': { promptPer1M: 0.5, completionPer1M: 1.5 },
  // o-series reasoning models
  'o3-pro': { promptPer1M: 20, completionPer1M: 80 },
  'o3-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
  'o3': { promptPer1M: 2.0, completionPer1M: 8.0 },
  'o4-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
  'o1-mini': { promptPer1M: 3.0, completionPer1M: 12.0 },
  'o1': { promptPer1M: 15.0, completionPer1M: 60.0 },
  // DeepSeek
  'deepseek-chat': { promptPer1M: 0.27, completionPer1M: 1.1 },
  'deepseek-reasoner': { promptPer1M: 0.55, completionPer1M: 2.19 },
};

/**
 * Calculate the USD cost for a given model and token counts.
 * Returns null if the model is unknown (caller should store tokens only).
 */
export function calculateCostUsd(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number,
): number | null {
  if (!model) return null;

  // Try exact match first, then prefix match (e.g. "gpt-4o-2024-08-06" → "gpt-4o")
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const prefix = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
    if (prefix) pricing = MODEL_PRICING[prefix];
  }
  if (!pricing) return null;

  return (
    (promptTokens / 1_000_000) * pricing.promptPer1M +
    (completionTokens / 1_000_000) * pricing.completionPer1M
  );
}

/**
 * Get all known model names (for admin/settings UI).
 */
export function getKnownModels(): string[] {
  return Object.keys(MODEL_PRICING);
}
