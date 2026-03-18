/**
 * Mock OpenAI-compatible client for integration tests.
 *
 * `chat.completions.create` shifts from a pre-built response queue on each call,
 * enabling deterministic scripting of multi-turn agent ReAct loops.
 */

import type OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Response types (subset of OpenAI ChatCompletion format)
// ---------------------------------------------------------------------------

export interface MockChatResponse {
  id?: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls';
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

let callCounter = 0;

/** Build a response whose assistant message contains a single tool call. */
export function buildToolCallResponse(
  toolName: string,
  args: Record<string, any>,
): MockChatResponse {
  const id = `call_${++callCounter}`;
  return {
    id: `chatcmpl-mock-${id}`,
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function',
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

/** Build a simple text content response (no tool calls). */
export function buildTextResponse(content: string): MockChatResponse {
  return {
    id: `chatcmpl-mock-text-${++callCounter}`,
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
  };
}

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

/**
 * Create a mock OpenAI-compatible client.
 *
 * `chat.completions.create` shifts from `responseQueue` on each invocation.
 * Throws if the queue is exhausted.
 */
export function createMockOpenAIClient(responseQueue: MockChatResponse[]) {
  const queue = [...responseQueue];
  const calls: any[] = [];

  const client = {
    chat: {
      completions: {
        create: jest.fn(async (params: any) => {
          calls.push(params);
          const next = queue.shift();
          if (!next) {
            throw new Error(
              '[MockOpenAIClient] Response queue exhausted — add more responses to the queue.',
            );
          }
          return next;
        }),
      },
    },
    /** Expose recorded calls for assertions. */
    __calls: calls,
  };

  return client as unknown as OpenAI & { __calls: any[] };
}
