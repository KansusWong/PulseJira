import OpenAI from 'openai';

export const openaiConfigured = !!process.env.OPENAI_API_KEY;

if (!openaiConfigured && typeof window === 'undefined') {
  console.warn(
    '⚠️  OPENAI_API_KEY is not set. LLM features will be unavailable.'
  );
}

/** Throws if no OpenAI API key is available. */
export function assertOpenAI(): void {
  if (!openaiConfigured) {
    throw new Error(
      'OpenAI API key is not configured. Set OPENAI_API_KEY environment variable.'
    );
  }
}

/**
 * OpenAI-compatible client connector.
 * Creates a configured OpenAI client based on environment variables.
 * Throws if no API key is available (unless explicitly provided).
 */
export function createOpenAIClient(options?: {
  apiKey?: string;
  baseURL?: string;
}): OpenAI {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OpenAI API key is required. Provide it via options.apiKey or set OPENAI_API_KEY.'
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: options?.baseURL || process.env.OPENAI_BASE_URL || undefined,
  });
}

export function getDefaultModel(): string {
  return process.env.LLM_MODEL_NAME || 'gpt-4o';
}
