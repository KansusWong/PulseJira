import OpenAI from 'openai';

/**
 * DeepSeek external connector — creates DeepSeek client for Red Team critic.
 */
export function createDeepSeekClient(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  });
}

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL_NAME || 'deepseek-reasoner';
}

export function isDeepSeekAvailable(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
