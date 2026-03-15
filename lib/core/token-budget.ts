/**
 * Token budget management for long-running agent conversations.
 *
 * Provides approximate token counting and budget control to determine
 * when context compression is needed.
 */

import type OpenAI from 'openai';

/**
 * Approximate token count for a string.
 * Uses the ~4 chars per token heuristic for English/code mixed content.
 * For CJK-heavy text we use ~2 chars per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough heuristic: check if >30% CJK characters
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const ratio = cjkCount / text.length;
  const charsPerToken = ratio > 0.3 ? 2 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a single chat message (including role overhead).
 */
function estimateMessageTokens(msg: OpenAI.Chat.ChatCompletionMessageParam): number {
  const overhead = 4; // role + formatting tokens
  let content = '';

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((part: any) => (typeof part === 'string' ? part : part.text || ''))
      .join('');
  }

  // Account for tool calls in assistant messages
  if ('tool_calls' in msg && Array.isArray((msg as any).tool_calls)) {
    for (const tc of (msg as any).tool_calls) {
      content += tc.function?.name || '';
      content += tc.function?.arguments || '';
    }
  }

  return overhead + estimateTokens(content);
}

/**
 * Context budget controller.
 * Tracks token usage and determines when compression is needed.
 */
export class ContextBudget {
  readonly maxTokens: number;

  constructor(
    maxTokens: number = parseInt(process.env.AGENT_MAX_CONTEXT_TOKENS || '200000', 10),
    private reservedForResponse: number = 4_000,
    private reservedForTools: number = 8_000,
  ) {
    this.maxTokens = maxTokens;
  }

  /** Calculate total token estimate for a message array. */
  measure(messages: OpenAI.Chat.ChatCompletionMessageParam[]): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  }

  /** Whether the messages are likely to exceed the available budget. */
  needsCompression(messages: OpenAI.Chat.ChatCompletionMessageParam[]): boolean {
    const used = this.measure(messages);
    return used > this.availableBudget();
  }

  /** Tokens available for message history (total minus reserves). */
  availableBudget(): number {
    return this.maxTokens - this.reservedForResponse - this.reservedForTools;
  }

  /** Whether context usage has reached the Team upgrade threshold (75% of max). */
  needsUpgrade(messages: OpenAI.Chat.ChatCompletionMessageParam[]): boolean {
    return this.measure(messages) > this.maxTokens * 0.75;
  }

  /** Get the current usage ratio (0–1) for a message array. */
  usageRatio(messages: OpenAI.Chat.ChatCompletionMessageParam[]): number {
    return this.measure(messages) / this.maxTokens;
  }
}
