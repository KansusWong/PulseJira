import OpenAI from 'openai';
import { BaseTool } from './base-tool';
import { generateJSON, cleanJSON, isReasonerModel, LLMError, withPoolFailover } from './llm';
import { recordLlmUsage } from '@/lib/services/usage';
import { getLLMPool } from '@/lib/services/llm-pool';
import { createStructuredLogger, generateTraceId } from '@/lib/utils/logger';
import { buildSkillPromptForAgent } from '@/lib/skills/agent-skill-runtime';
import { ContextBudget } from './token-budget';
import type { AgentConfig, AgentContext } from './types';

// --- Context management constants (#14: configurable via env) ---
/** Maximum number of recent messages to keep (excluding system + initial user). */
const MAX_CONTEXT_MESSAGES = parseInt(process.env.AGENT_MAX_CONTEXT_MESSAGES || '40', 10);
/** Per-call timeout for LLM API requests (ms). */
const LLM_TIMEOUT_MS = parseInt(process.env.AGENT_LLM_TIMEOUT_MS || '120000', 10);
/** Fixed model for context compression (cheap & fast, independent of agent model). */
const COMPRESSION_MODEL = process.env.AGENT_COMPRESSION_MODEL || 'gpt-4o-mini';
/** Delay between ReAct loop steps to avoid 429 rate limiting (ms). */
const INTER_STEP_DELAY_MS = parseInt(process.env.AGENT_INTER_STEP_DELAY_MS || '1500', 10);
/** Token budget controller — triggers compression based on estimated token count. */
const contextBudget = new ContextBudget();

function resolveMappedModelForAccount(
  requestedModel: string,
  modelMapping?: Record<string, string>,
): string {
  const mapping = modelMapping || {};
  const requestedKey = requestedModel.trim().toLowerCase();

  for (const [source, target] of Object.entries(mapping)) {
    if (!source || !target) continue;
    if (source.trim().toLowerCase() === requestedKey) return target.trim();
  }

  const wildcard = mapping['*'] || mapping.default || mapping.DEFAULT;
  if (typeof wildcard === 'string' && wildcard.trim()) return wildcard.trim();
  return requestedModel;
}

/**
 * Compress context when message history grows too large.
 *
 * Trigger conditions (either one):
 * 1. Message count exceeds MAX_CONTEXT_MESSAGES
 * 2. Estimated token count exceeds ContextBudget threshold
 *
 * Three-layer approach:
 * - Working Memory (hot): last N messages kept in full
 * - Compressed Context (warm): LLM-generated summary of trimmed messages
 * - Persistent Memory (cold): Blackboard / RAG (handled elsewhere)
 *
 * Uses an independent LLM client for compression (not the agent's client)
 * to avoid starving the agent's quota on rate limits.
 * Falls back to simple trimming if the compression LLM call fails.
 * Never splits a tool_call / tool-result pair.
 */
async function compressContext(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxRecent: number = MAX_CONTEXT_MESSAGES,
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  // Dual trigger: message count OR token budget exceeded
  const countExceeded = messages.length > maxRecent + 2;
  const budgetExceeded = contextBudget.needsCompression(messages);
  if (!countExceeded && !budgetExceeded) return messages;

  const systemMsg = messages[0];
  const userMsg = messages[1];

  // Find a safe cut point — never start on a 'tool' role (orphaned tool result)
  let cutStart = messages.length - maxRecent;
  if (cutStart < 2) cutStart = 2; // Don't cut into system/user
  while (cutStart < messages.length && messages[cutStart].role === 'tool') {
    cutStart++;
  }

  const trimmedMessages = messages.slice(2, cutStart);
  if (trimmedMessages.length === 0) return messages;

  const recentMessages = messages.slice(cutStart);

  // Attempt LLM-based compression using an independent pool client
  let summaryContent: string;
  try {
    const excerpts = trimmedMessages.map(m => {
      const content = typeof m.content === 'string' ? m.content?.slice(0, 200) : '(tool call)';
      return `[${m.role}]: ${content}`;
    }).join('\n');

    const summaryPrompt = `Summarize the following agent conversation history concisely.
Focus on: key decisions made, tools used and their results, errors encountered, important outputs.
Format as structured bullet points. Keep under 500 words.

${excerpts}`;

    // Use independent client from pool — does not share agent's client/quota
    const resolved = getLLMPool().getClientOrFallback({ tags: ['compression'] });
    const summaryResponse = await resolved.client.chat.completions.create(
      {
        model: COMPRESSION_MODEL,
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 800,
      },
      { timeout: 30_000 },
    );

    summaryContent = summaryResponse.choices[0]?.message?.content
      || `[${trimmedMessages.length} earlier messages trimmed]`;
  } catch {
    // Fallback to simple placeholder if compression fails
    summaryContent = `[${trimmedMessages.length} earlier messages (tool calls and results) were trimmed to manage context size.]`;
  }

  const contextMsg: OpenAI.Chat.ChatCompletionMessageParam = {
    role: 'user',
    content: `[Compressed Context — ${trimmedMessages.length} earlier messages summarized]\n\n${summaryContent}\n\n[End of compressed context. Continue with recent messages below.]`,
  };

  return [systemMsg, userMsg, contextMsg, ...recentMessages];
}

/**
 * Lightweight trim fallback — used when no LLM client is available.
 * Keeps: system prompt + initial user message + summary note + last N messages.
 */
function trimMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxRecent: number = MAX_CONTEXT_MESSAGES,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (messages.length <= maxRecent + 2) return messages;

  const systemMsg = messages[0];
  const userMsg = messages[1];

  let cutStart = messages.length - maxRecent;
  while (cutStart < messages.length && messages[cutStart].role === 'tool') {
    cutStart++;
  }

  const trimmedCount = cutStart - 2;
  if (trimmedCount <= 0) return messages;

  const recentMessages = messages.slice(cutStart);
  const summaryMsg: OpenAI.Chat.ChatCompletionMessageParam = {
    role: 'user',
    content: `[Context note: ${trimmedCount} earlier messages (tool calls and results) were trimmed to manage context size. Continue with the recent context below.]`,
  };

  return [systemMsg, userMsg, summaryMsg, ...recentMessages];
}

function resolveRuntimeSkillPrompt(agentName: string): string {
  const base = String(agentName || '').trim();
  if (!base) return '';

  const candidates = new Set<string>([
    base,
    base.replace(/_/g, '-'),
  ]);

  for (const candidate of candidates) {
    const skillPrompt = buildSkillPromptForAgent(candidate);
    if (skillPrompt) return skillPrompt;
  }

  return '';
}

export class BaseAgent {
  private config: AgentConfig;
  private openai: OpenAI;
  private accountId: string;
  private accountName: string;
  private readonly useExplicitClient: boolean;

  constructor(config: AgentConfig) {
    const runtimeSkillPrompt = resolveRuntimeSkillPrompt(config.name);
    const hasInjectedSkills = config.systemPrompt.includes('## Loaded Skills');

    this.config = {
      maxLoops: 10,
      ...config,
      systemPrompt: hasInjectedSkills || !runtimeSkillPrompt
        ? config.systemPrompt
        : `${config.systemPrompt}${runtimeSkillPrompt}`,
      model: config.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o',
    };

    this.useExplicitClient = !!config.client;

    if (config.client) {
      this.openai = config.client;
      this.accountId = config.accountId || '__explicit__';
      this.accountName = config.accountName || 'Explicit';
    } else {
      const resolved = getLLMPool().getClientOrFallback({ tags: config.poolTags });
      this.openai = resolved.client;
      this.accountId = resolved.accountId;
      this.accountName = resolved.accountName;
    }
  }

  private async createCompletionWithFailover(
    params: any,
    label: string,
    metadata?: { projectId?: string; agentName?: string; model?: string },
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    if (this.useExplicitClient) {
      return this.openai.chat.completions.create(params, { timeout: LLM_TIMEOUT_MS });
    }

    return withPoolFailover(
      async (resolved) => {
        const requestedModel = String(params?.model || this.config.model || process.env.LLM_MODEL_NAME || 'gpt-4o');
        const mappedModel = resolveMappedModelForAccount(requestedModel, resolved.modelMapping);
        const nextParams = mappedModel === requestedModel ? params : { ...params, model: mappedModel };
        const completion = await resolved.client.chat.completions.create(nextParams, { timeout: LLM_TIMEOUT_MS });
        // Update usage attribution to the actual account used by this successful call.
        this.openai = resolved.client;
        this.accountId = resolved.accountId;
        this.accountName = resolved.accountName;
        return completion;
      },
      {
        tags: this.config.poolTags,
        label,
        projectId: metadata?.projectId,
        agentName: metadata?.agentName,
        model: metadata?.model,
      },
    );
  }

  /**
   * Full ReAct loop with OpenAI function calling.
   * Used by agents that need tool invocation (TechLead, Critic, Researcher).
   *
   * If `exitToolName` is configured, the loop terminates when that tool is called
   * and returns the tool's arguments as the result.
   *
   * Otherwise, the loop terminates when the model responds with text content
   * (no tool calls) and returns the parsed JSON or raw text.
   *
   * Safety: Reasoner models (e.g. deepseek-reasoner) don't support function calling.
   * Tools are automatically stripped for these models to prevent API errors.
   */
  async run(userMessage: string, context: AgentContext = {}): Promise<any> {
    const { name, systemPrompt, tools = [], maxLoops, exitToolName, model, initialMessages } = this.config;
    const traceId = context.traceId || generateTraceId();
    const slog = createStructuredLogger({ traceId, agent: name });
    const log = context.logger || console.log;

    // If resuming from a previous incomplete run, reuse its conversation history;
    // otherwise start fresh with system + user messages.
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = initialMessages
      ? [...initialMessages, { role: 'user' as const, content: `You have been granted ${maxLoops} additional steps to finish. Continue from where you left off.` }]
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ];

    // Reasoner models don't support function calling — strip tools to prevent API errors
    const reasoner = isReasonerModel(model!);
    if (reasoner && tools.length > 0) {
      await log(`[${name}] Model "${model}" is a reasoner and does not support function calling. Tools disabled for this run.`);
    }

    const openAITools = (!reasoner && tools.length > 0)
      ? tools.map(tool => tool.toFunctionDef() as OpenAI.Chat.ChatCompletionTool)
      : undefined;

    for (let step = 0; step < maxLoops!; step++) {
      // Delay between steps to avoid 429 rate limiting on shared LLM accounts
      if (step > 0 && INTER_STEP_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, INTER_STEP_DELAY_MS));
      }

      await log(`[${name}] Step ${step + 1}: Thinking...`);

      const completionStartAt = Date.now();
      const completion = await this.createCompletionWithFailover(
        {
          model: model!,
          messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
          ...(openAITools ? { tools: openAITools, tool_choice: 'auto' } : {}),
        },
        `${name}.step-${step + 1}`,
        { projectId: context.projectId, agentName: name, model: model! },
      );
      const completionDurationMs = Date.now() - completionStartAt;

      const message = completion.choices[0]?.message;
      if (!message) throw new Error(`[${name}] No response from LLM`);

      const usage = completion.usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

        slog.info('llm.completion', { step: step + 1, promptTokens, completionTokens, totalTokens });

        if (context.recordUsage) {
          context.recordUsage({
            agentName: name,
            projectId: context.projectId,
            model: model!,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          });
        } else {
          recordLlmUsage({
            agentName: name,
            projectId: context.projectId ?? null,
            model: model!,
            promptTokens,
            completionTokens,
            durationMs: completionDurationMs,
            accountId: this.accountId,
            accountName: this.accountName,
            signalId: context.signalId ?? null,
            traceId,
          }).catch((err) => console.error('[BaseAgent] Record LLM usage failed:', err));
        }
      }

      messages.push(message);

      // Emit LLM intermediate reasoning text (visible as bullet in UI)
      if (message.content && message.tool_calls?.length) {
        const text = typeof message.content === 'string' ? message.content.trim() : '';
        if (text) {
          await log(`[${name}] Text: ${text.slice(0, 200)}`);
        }
      }

      // --- Handle tool calls ---
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const tool = tools.find(t => t.name === toolName);

          if (!tool) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: Tool "${toolName}" not found.`,
            });
            continue;
          }

          // Exit condition: if this is the exit tool, return its arguments directly
          if (exitToolName && toolName === exitToolName) {
            try {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
              await log(`[${name}] Exit tool "${exitToolName}" called. Finishing.`);
              return args;
            } catch (parseErr: unknown) {
              const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
              await log(`[${name}] Failed to parse exit tool arguments: ${parseMsg}. Continuing loop.`);
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Error: Failed to parse arguments as JSON: ${parseMsg}. Please retry with valid JSON.`,
              });
              continue;
            }
          }

          // Execute the tool
          await log(`[${name}] Action: ${toolName}(${toolCall.function.arguments.slice(0, 100)})`);
          let resultStr = '';
          try {
            const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);

            // Approval gate: block on human approval for dangerous tools
            if (tool.requiresApproval && context.onApprovalRequired) {
              const approved = await context.onApprovalRequired({
                toolName,
                toolArgs: args,
                agentName: name,
              });
              if (!approved) {
                resultStr = 'Tool execution was rejected by the user. Adjust your plan accordingly.';
                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: resultStr,
                });
                continue;
              }
            }

            const result = await tool.execute(args);
            resultStr = result.success
              ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data))
              : `Error: ${result.error}`;
          } catch (e: unknown) {
            const isTimeout = e instanceof Error && (e.message.includes('timeout') || e.message.includes('ETIMEDOUT'));
            const isRateLimit = e instanceof Error && (e.message.includes('429') || e.message.includes('rate limit'));
            const errorType = isTimeout ? 'TIMEOUT' : isRateLimit ? 'RATE_LIMIT' : 'EXECUTION_ERROR';
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`[${name}] Tool "${toolName}" ${errorType}:`, e);
            resultStr = `Error executing tool (${errorType}): ${errorMsg}`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultStr,
          });

          // Emit structured result log for frontend display
          const isError = resultStr.startsWith('Error');
          const preview = resultStr.slice(0, 150).replace(/\n/g, ' ');
          await log(`[${name}] Result: ${toolName} | ${isError ? 'ERROR' : 'OK'} | ${preview}`);

          // Inject corrective hint when code_edit fails on missing file
          if (toolName === 'code_edit' && resultStr.includes('File not found')) {
            messages.push({
              role: 'user',
              content: '⚠️ 上面的 code_edit 调用失败了，因为文件不存在。你必须改用 code_write 来创建这个新文件，不要再次尝试 code_edit。',
            });
          }
        }

        // Checkpoint callback — fire after all tool calls in this step are processed
        if (context.onCheckpoint) {
          context.onCheckpoint({ messages: [...messages], stepsCompleted: step + 1 });
        }

        // Warn agent about remaining steps BEFORE continuing the loop
        if (exitToolName) {
          const remaining = maxLoops! - step - 1;
          if (remaining <= 5 && remaining > 1) {
            messages.push({
              role: 'user',
              content: `⚠️ You have ${remaining} step(s) remaining. Wrap up your current work and call "${exitToolName}" soon with your best result so far.`,
            });
          } else if (remaining <= 1) {
            messages.push({
              role: 'user',
              content: `🚨 FINAL STEP. You MUST call "${exitToolName}" NOW. Summarize everything you've done and output the result immediately. Do NOT call any other tool.`,
            });
          }
        }

        continue;
      }

      // --- No tool calls: model returned text content ---
      if (message.content) {
        await log(`[${name}] Completed with text response.`);
        try {
          const cleaned = cleanJSON(message.content);
          return JSON.parse(cleaned);
        } catch {
          return message.content;
        }
      }
    }

    // Graceful degradation: extract what we can but ALWAYS signal incomplete
    // so the caller (e.g. implement-pipeline) can request a budget extension.
    await log(`[${name}] Max loops (${maxLoops}) reached. Attempting to extract result from conversation...`);

    let extractedResult: Record<string, any> | undefined;

    // Try to invoke the exit tool one last time via a focused prompt
    if (exitToolName && openAITools) {
      try {
        messages.push({
          role: 'user',
          content: `You ran out of steps. Call "${exitToolName}" NOW with a summary of all work completed so far.`,
        });
        const lastChanceStartAt = Date.now();
        const lastChance = await this.createCompletionWithFailover(
          {
            model: model!,
            messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
            tools: openAITools,
            tool_choice: { type: 'function', function: { name: exitToolName } },
          },
          `${name}.last-chance`,
          { projectId: context.projectId, agentName: name, model: model! },
        );
        const lastChanceDurationMs = Date.now() - lastChanceStartAt;
        const lcUsage = lastChance.usage;
        if (lcUsage) {
          const promptTokens = lcUsage.prompt_tokens ?? 0;
          const completionTokens = lcUsage.completion_tokens ?? 0;
          if (context.recordUsage) {
            context.recordUsage({
              agentName: name,
              projectId: context.projectId,
              model: model!,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: lcUsage.total_tokens ?? (promptTokens + completionTokens),
            });
          } else {
            recordLlmUsage({
              agentName: name,
              projectId: context.projectId ?? null,
              model: model!,
              promptTokens,
              completionTokens,
              durationMs: lastChanceDurationMs,
              accountId: this.accountId,
              accountName: this.accountName,
              signalId: context.signalId ?? null,
              traceId,
            }).catch((err) => console.error('[BaseAgent] Record LLM usage failed:', err));
          }
        }
        const lcMsg = lastChance.choices[0]?.message;
        if (lcMsg?.tool_calls?.[0]) {
          try {
            extractedResult = JSON.parse(lcMsg.tool_calls[0].function.arguments);
            await log(`[${name}] Extracted result via forced exit tool call.`);
          } catch (parseErr: unknown) {
            const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            await log(`[${name}] Failed to parse last-chance exit tool arguments: ${parseMsg}`);
            // Fall through to text extraction
          }
        }
      } catch {
        /* fall through to text extraction */
      }
    }

    // Try to extract something useful from the last assistant message
    let lastProgress: string | undefined;
    if (!extractedResult) {
      const lastAssistantMsg = [...messages].reverse().find(
        (m) => m.role === 'assistant' && (m as any).content
      );
      if (lastAssistantMsg && (lastAssistantMsg as any).content) {
        lastProgress = (lastAssistantMsg as any).content;
        try {
          const cleaned = cleanJSON(lastProgress!);
          extractedResult = JSON.parse(cleaned);
        } catch {
          /* fall through to incomplete */
        }
      }
    }

    // ALWAYS return incomplete signal with conversation history so the caller
    // can request a budget extension from Architect.
    await log(`[${name}] Returning incomplete result — caller may request budget extension.`);
    return {
      __incomplete: true,
      stepsUsed: maxLoops,
      lastProgress: lastProgress || 'No extractable progress.',
      __messages: messages,
      ...(extractedResult || {}),
    };
  }

  /**
   * Single-shot LLM call. No tool use, no loop.
   * Used by agents that just need structured JSON output (PM, Blue Team, Arbitrator).
   * Throws LLMError on failure — callers should handle or let propagate.
   */
  async runOnce(userMessage: string, context: AgentContext = {}): Promise<any> {
    const { name, systemPrompt, model } = this.config;
    const traceId = context.traceId || generateTraceId();
    const slog = createStructuredLogger({ traceId, agent: name });
    const log = context.logger || console.log;

    slog.info('runOnce.start');
    await log(`[${name}] Generating structured response...`);

    try {
      const useExplicit = this.useExplicitClient;
      return await generateJSON(systemPrompt, userMessage, {
        model: model,
        ...(useExplicit ? { client: this.openai, accountId: this.accountId, accountName: this.accountName } : { poolTags: this.config.poolTags }),
        agentName: name,
        projectId: context.projectId ?? null,
        signalId: context.signalId ?? null,
        traceId,
        onUsage: context.recordUsage
          ? (usage) => {
              context.recordUsage!({
                agentName: name,
                projectId: context.projectId,
                model: usage.model ?? model,
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
              });
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        throw new LLMError(`[${name}] ${error.message}`, error.model, error.cause);
      }
      throw error;
    }
  }
}
