import OpenAI from 'openai';
import { BaseTool } from './base-tool';
import { generateJSON, cleanJSON, isReasonerModel, LLMError, withPoolFailover, withPoolFailoverStream } from './llm';
import { recordLlmUsage } from '@/lib/services/usage';
import { getLLMPool } from '@/lib/services/llm-pool';
import { createStructuredLogger, generateTraceId } from '@/lib/utils/logger';
import { buildSkillPromptForAgent } from '@/lib/skills/agent-skill-runtime';
import { ContextBudget } from './token-budget';
import { createToolContext } from './tool-context-factory';
import type { AgentConfig, AgentContext } from './types';

// --- Context management constants (#14: configurable via env) ---
/** Maximum number of recent messages to keep (excluding system + initial user). */
const MAX_CONTEXT_MESSAGES = parseInt(process.env.AGENT_MAX_CONTEXT_MESSAGES || '40', 10);
/** Per-call timeout for LLM API requests (ms). */
const LLM_TIMEOUT_MS = parseInt(process.env.AGENT_LLM_TIMEOUT_MS || '120000', 10);
/** Fixed model for context compression (cheap & fast, independent of agent model). */
const COMPRESSION_MODEL = process.env.AGENT_COMPRESSION_MODEL || 'glm-5';
/** Base delay between ReAct loop steps (ms). Default 0 — only back off on 429. */
const INTER_STEP_DELAY_MS = parseInt(process.env.AGENT_INTER_STEP_DELAY_MS || '0', 10);
/** Maximum adaptive backoff delay after 429 rate-limit errors (ms). */
const MAX_BACKOFF_MS = parseInt(process.env.AGENT_MAX_BACKOFF_MS || '10000', 10);

// --- Tool-result shrinking constants ---
/** Number of recent messages considered "fresh" — tool results kept at higher char limit. */
const TOOL_RESULT_FRESH_WINDOW = parseInt(process.env.AGENT_TOOL_RESULT_FRESH_WINDOW || '10', 10);
/** Max chars for tool results in the fresh window. */
const TOOL_RESULT_FRESH_CHARS = parseInt(process.env.AGENT_TOOL_RESULT_FRESH_CHARS || '12000', 10);
/** Max chars for tool results outside the fresh window (stale). */
const TOOL_RESULT_STALE_CHARS = parseInt(process.env.AGENT_TOOL_RESULT_STALE_CHARS || '1500', 10);
/** Minimum content length before truncation applies (skip tiny results). */
const TOOL_RESULT_MIN_TRUNCATE = parseInt(process.env.AGENT_TOOL_RESULT_MIN_TRUNCATE || '200', 10);
/** Enable parallel tool execution when no approval is needed. Set to 'false' to disable. */
const PARALLEL_TOOL_EXEC = process.env.AGENT_PARALLEL_TOOL_EXEC !== 'false';
/** Fast model for intermediate tool-calling steps. Unset = always use primary model. */
const FAST_MODEL = process.env.AGENT_FAST_MODEL || '';
/** Token budget controller — triggers compression based on estimated token count. */
const contextBudget = new ContextBudget();

function resolveMappedModelForAccount(
  requestedModel: string,
  modelMapping?: Record<string, string>,
  accountDefaultModel?: string,
): string {
  const mapping = modelMapping || {};
  const requestedKey = requestedModel.trim().toLowerCase();

  for (const [source, target] of Object.entries(mapping)) {
    if (!source || !target) continue;
    if (source.trim().toLowerCase() === requestedKey) return target.trim();
  }

  const wildcard = mapping['*'] || mapping.default || mapping.DEFAULT;
  if (typeof wildcard === 'string' && wildcard.trim()) return wildcard.trim();

  // If the account has a modelMapping but this model isn't in it,
  // the model likely belongs to a different provider.
  // Fall back to the account's default model to avoid "invalid model" errors.
  if (accountDefaultModel && Object.keys(mapping).length > 0) {
    return accountDefaultModel;
  }

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
  if (!countExceeded && !budgetExceeded) return shrinkToolResults(messages);

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

  return shrinkToolResults([systemMsg, userMsg, contextMsg, ...recentMessages]);
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

  return shrinkToolResults([systemMsg, userMsg, summaryMsg, ...recentMessages]);
}

/**
 * Shrink tool-result messages to reduce prompt token growth across ReAct steps.
 *
 * Two-tier truncation based on recency:
 * - Fresh (last TOOL_RESULT_FRESH_WINDOW messages): truncate to TOOL_RESULT_FRESH_CHARS
 * - Stale (older): truncate to TOOL_RESULT_STALE_CHARS
 *
 * Preserves error results in full (start with "Error") for agent self-correction.
 * Returns a new array — never mutates the input.
 */
function shrinkToolResults(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const freshStart = Math.max(0, messages.length - TOOL_RESULT_FRESH_WINDOW);

  return messages.map((msg, idx) => {
    if (msg.role !== 'tool') return msg;

    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length < TOOL_RESULT_MIN_TRUNCATE) return msg;
    if (content.startsWith('Error')) return msg;

    const limit = idx >= freshStart ? TOOL_RESULT_FRESH_CHARS : TOOL_RESULT_STALE_CHARS;
    if (content.length <= limit) return msg;

    const truncated = content.slice(0, limit) +
      `\n...[truncated, ${content.length} chars total]`;

    return { ...msg, content: truncated };
  });
}

/**
 * Generate a structured state summary from the current conversation.
 * Used when upgrading from subagent mode to Team mode, to hand off
 * context to newly-created Teammates.
 */
async function generateStateSummary(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  agentName: string,
): Promise<string> {
  const excerpts = messages.map(m => {
    const content = typeof m.content === 'string' ? m.content?.slice(0, 300) : '(tool call)';
    return `[${m.role}]: ${content}`;
  }).join('\n');

  const summaryPrompt = `You are summarizing the current state of a software engineering conversation for handoff to a team of specialized agents.

Produce a structured summary covering:
1. **Original User Request**: What the user asked for
2. **Work Completed**: Key decisions made, tools used, files created/modified
3. **Current State**: Where things stand right now
4. **Remaining Work**: What still needs to be done
5. **Active Subagents**: List each subagent that was spawned, its task, and its current status
6. **Key References**: Important file paths, code snippets, or data that teammates will need

Keep under 1000 words. Be precise and actionable.

Conversation:
${excerpts.slice(0, 15000)}`;

  try {
    const resolved = getLLMPool().getClientOrFallback({ tags: ['compression'] });
    const response = await resolved.client.chat.completions.create(
      {
        model: COMPRESSION_MODEL,
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 1500,
      },
      { timeout: 30_000 },
    );
    return response.choices[0]?.message?.content || '[State summary generation failed]';
  } catch {
    return '[State summary generation failed — using raw context]';
  }
}

// ---------------------------------------------------------------------------
// Skill prompt cache — 60 second TTL per agent name
// ---------------------------------------------------------------------------
const _skillPromptCache = new Map<string, { prompt: string; loadedAt: number }>();
const SKILL_PROMPT_TTL_MS = 60_000;

function resolveRuntimeSkillPrompt(agentName: string): string {
  const base = String(agentName || '').trim();
  if (!base) return '';

  // Check cache
  const cached = _skillPromptCache.get(base);
  if (cached && Date.now() - cached.loadedAt < SKILL_PROMPT_TTL_MS) {
    return cached.prompt;
  }

  const candidates = new Set<string>([
    base,
    base.replace(/_/g, '-'),
  ]);

  let result = '';
  for (const candidate of candidates) {
    const skillPrompt = buildSkillPromptForAgent(candidate);
    if (skillPrompt) {
      result = skillPrompt;
      break;
    }
  }

  _skillPromptCache.set(base, { prompt: result, loadedAt: Date.now() });
  return result;
}

// ---------------------------------------------------------------------------
// Stream accumulation helpers (for runStreaming)
// ---------------------------------------------------------------------------

interface StreamAccumulator {
  content: string;
  reasoningContent: string;
  toolCalls: Map<number, { id: string; function: { name: string; arguments: string } }>;
  usage: OpenAI.CompletionUsage | null;
  finishReason: string | null;
}

function createStreamAccumulator(): StreamAccumulator {
  return { content: '', reasoningContent: '', toolCalls: new Map(), usage: null, finishReason: null };
}

/**
 * Process a single streaming chunk delta into the accumulator.
 * Fires onToken / onReasoningToken callbacks synchronously for each content fragment.
 */
function accumulateDelta(
  acc: StreamAccumulator,
  delta: any,
  choice: any,
  onToken?: (t: string) => void,
  onReasoningToken?: (t: string) => void,
): void {
  // Content delta
  if (delta.content) {
    acc.content += delta.content;
    onToken?.(delta.content);
  }
  // Reasoning content delta (GLM-5 thinking mode / DeepSeek-R1 style)
  if (delta.reasoning_content) {
    acc.reasoningContent += delta.reasoning_content;
    onReasoningToken?.(delta.reasoning_content);
  }
  // Tool calls delta — indexed accumulation
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index;
      if (!acc.toolCalls.has(idx)) {
        acc.toolCalls.set(idx, { id: tc.id || '', function: { name: '', arguments: '' } });
      }
      const existing = acc.toolCalls.get(idx)!;
      if (tc.id) existing.id = tc.id;
      if (tc.function?.name) existing.function.name += tc.function.name;
      if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
    }
  }
  // Finish reason
  if (choice.finish_reason) {
    acc.finishReason = choice.finish_reason;
  }
}

/** Convert accumulated tool calls Map to the array format expected by OpenAI message types. */
function accToolCallsToArray(
  acc: StreamAccumulator,
): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> | undefined {
  if (acc.toolCalls.size === 0) return undefined;
  return [...acc.toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([_, tc]) => ({ id: tc.id, type: 'function' as const, function: tc.function }));
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
      model: config.model ?? process.env.LLM_MODEL_NAME ?? 'glm-5',
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
        const requestedModel = String(params?.model || this.config.model || process.env.LLM_MODEL_NAME || 'glm-5');
        const mappedModel = resolveMappedModelForAccount(requestedModel, resolved.modelMapping, resolved.model);
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
   * Create a streaming LLM completion with pool failover.
   * Failover only during .create() phase; mid-stream failures are not retried.
   */
  private async createStreamingCompletionWithFailover(
    params: any,
    label: string,
    metadata?: { projectId?: string; agentName?: string; model?: string },
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    if (this.useExplicitClient) {
      return this.openai.chat.completions.create(
        { ...params, stream: true, stream_options: { include_usage: true } },
        { timeout: LLM_TIMEOUT_MS },
      ) as any;
    }

    return withPoolFailoverStream(
      async (resolved) => {
        const requestedModel = String(params?.model || this.config.model || process.env.LLM_MODEL_NAME || 'glm-5');
        const mappedModel = resolveMappedModelForAccount(requestedModel, resolved.modelMapping, resolved.model);
        const nextParams: any = {
          ...params,
          model: mappedModel,
          stream: true,
          stream_options: { include_usage: true },
        };
        // GLM-5 extension: enable tool-level streaming
        if (params.tools) nextParams.tool_stream = true;
        const stream = await resolved.client.chat.completions.create(nextParams, { timeout: LLM_TIMEOUT_MS });
        this.openai = resolved.client;
        this.accountId = resolved.accountId;
        this.accountName = resolved.accountName;
        return stream as any;
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
   * Record LLM usage from a completion (shared by run / runStreaming).
   */
  private _recordUsage(
    usage: OpenAI.CompletionUsage | null | undefined,
    step: number,
    name: string,
    model: string,
    context: AgentContext,
    traceId: string,
    durationMs: number,
    slog: ReturnType<typeof createStructuredLogger>,
  ): void {
    if (!usage) return;
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

    slog.info('llm.completion', { step: step + 1, promptTokens, completionTokens, totalTokens });

    if (context.recordUsage) {
      context.recordUsage({
        agentName: name,
        projectId: context.projectId,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });
    } else {
      recordLlmUsage({
        agentName: name,
        projectId: context.projectId ?? null,
        model,
        promptTokens,
        completionTokens,
        durationMs,
        accountId: this.accountId,
        accountName: this.accountName,
        signalId: context.signalId ?? null,
        traceId,
      }).catch((err) => console.error('[BaseAgent] Record LLM usage failed:', err));
    }
  }

  /**
   * Streaming ReAct loop — tokens flow incrementally via context callbacks.
   *
   * Same contract as run(): returns the final result (string | object).
   * The difference is that during execution, onToken/onReasoningToken/
   * onToolCallStart/onToolCallEnd/onStepStart callbacks fire in real-time.
   *
   * Subagents and teammates should continue using run() (no streaming needed).
   */
  async runStreaming(userMessage: string, context: AgentContext = {}): Promise<any> {
    const { name, systemPrompt, tools = [], maxLoops, exitToolName, model, initialMessages } = this.config;
    const traceId = context.traceId || generateTraceId();
    const slog = createStructuredLogger({ traceId, agent: name });
    const log = context.logger || console.log;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = initialMessages
      ? [...initialMessages, { role: 'user' as const, content: `You have been granted ${maxLoops} additional steps to finish. Continue from where you left off.` }]
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ];

    const reasoner = isReasonerModel(model!);
    if (reasoner && tools.length > 0) {
      await log(`[${name}] Model "${model}" is a reasoner and does not support function calling. Tools disabled for this run.`);
    }

    const openAITools = (!reasoner && tools.length > 0)
      ? tools.map(tool => tool.toFunctionDef() as OpenAI.Chat.ChatCompletionTool)
      : undefined;

    const toolCtx = tools.length > 0
      ? createToolContext({
          agentName: name,
          agentContext: context,
          tools,
          workspacePath: context.workspacePath,
          poolTags: this.config.poolTags,
          model: model!,
        })
      : undefined;

    const collectedMarkers: string[] = [];
    const MARKER_RE = /\[\[(?:QUESTION_DATA|PLAN_MODE_ENTER|PLAN_REVIEW|TEAM_UPGRADE)\]\][\s\S]*?\[\[\/(?:QUESTION_DATA|PLAN_MODE_ENTER|PLAN_REVIEW|TEAM_UPGRADE)\]\]/g;
    let upgradeOffered = false;
    let adaptiveDelay = INTER_STEP_DELAY_MS; // starts at base (default 0), grows on 429

    for (let step = 0; step < maxLoops!; step++) {
      if (step > 0 && adaptiveDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
      }

      // Check for user-injected messages (per-mate chat)
      if (context.onUserMessageCheck) {
        const injectedMsg = await context.onUserMessageCheck();
        if (injectedMsg) {
          messages.push({ role: 'user', content: `[User Feedback]: ${injectedMsg}` });
          await log(`[${name}] Received user feedback: ${injectedMsg.slice(0, 100)}`);
        }
      }

      context.onStepStart?.(step + 1);
      context.onContextUsage?.({
        estimated: contextBudget.measure(messages),
        max: contextBudget.maxTokens,
        ratio: contextBudget.usageRatio(messages),
      });
      await log(`[${name}] Step ${step + 1}: Thinking...`);

      // --- Team upgrade check (same as run()) ---
      if (!upgradeOffered && context.onCompactionUpgradeRequired && contextBudget.needsUpgrade(messages)) {
        upgradeOffered = true;
        const ratio = contextBudget.usageRatio(messages);
        const estimated = contextBudget.measure(messages);
        await log(`[${name}] Context usage at ${(ratio * 100).toFixed(0)}% — offering Team upgrade...`);

        const approved = await context.onCompactionUpgradeRequired({
          tokenUsage: { estimated, max: contextBudget.maxTokens, ratio },
        });

        if (approved) {
          await log(`[${name}] Team upgrade approved. Generating state summary...`);
          const stateSummary = await generateStateSummary(messages, name);
          const markerData = JSON.stringify({ stateSummary });
          const upgradeMsg = `[[TEAM_UPGRADE]]${markerData}[[/TEAM_UPGRADE]]\n\n正在升级为团队模式。每个子智能体将成为拥有独立上下文窗口的队友，以更好地完成任务。`;
          return collectedMarkers.length > 0
            ? collectedMarkers.join('\n') + '\n' + upgradeMsg
            : upgradeMsg;
        }
      }

      // --- Model routing: fast model for intermediate tool-calling steps ---
      const fastModelId = this.config.fastModel || FAST_MODEL;
      const isFirstStep = step === 0;
      const isNearEnd = exitToolName && (maxLoops! - step) <= 2;
      const stepModel = (fastModelId && !isFirstStep && !isNearEnd) ? fastModelId : model!;
      if (stepModel !== model!) {
        await log(`[${name}] Step ${step + 1}: Using fast model "${stepModel}"`);
      }

      // --- Streaming LLM call ---
      const completionStartAt = Date.now();
      let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      try {
        stream = await this.createStreamingCompletionWithFailover(
          {
            model: stepModel,
            messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
            ...(openAITools ? { tools: openAITools, tool_choice: 'auto' } : {}),
          },
          `${name}.step-${step + 1}`,
          { projectId: context.projectId, agentName: name, model: stepModel },
        );
      } catch (streamSetupErr: any) {
        const is429 = streamSetupErr.message?.includes('429') || streamSetupErr.status === 429;
        if (is429 && step < maxLoops! - 1) {
          adaptiveDelay = Math.min(Math.max(adaptiveDelay * 2, 2000), MAX_BACKOFF_MS);
          await log(`[${name}] Rate limited (429) at step ${step + 1}. Backing off ${adaptiveDelay}ms before retry.`);
          continue; // retry this step after backoff
        }
        throw new Error(`[${name}] Streaming LLM call failed: ${streamSetupErr.message}`);
      }

      // Accumulate stream chunks
      const acc = createStreamAccumulator();
      try {
        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          if (choice?.delta) {
            accumulateDelta(acc, choice.delta, choice, context.onToken, context.onReasoningToken);
          }
          if (chunk.usage) acc.usage = chunk.usage;
        }
      } catch (streamErr: any) {
        // Mid-stream failure — use whatever we accumulated so far
        console.error(`[${name}] Stream interrupted at step ${step + 1}:`, streamErr.message);
        // If we have some content, try to continue; otherwise re-throw
        if (!acc.content && acc.toolCalls.size === 0) {
          throw new Error(`[${name}] Stream interrupted with no usable content: ${streamErr.message}`);
        }
      }
      const completionDurationMs = Date.now() - completionStartAt;

      // Successful LLM call — decay adaptive delay back toward base
      if (adaptiveDelay > INTER_STEP_DELAY_MS) {
        adaptiveDelay = Math.max(INTER_STEP_DELAY_MS, Math.floor(adaptiveDelay / 2));
      }

      // Record usage (from final chunk)
      this._recordUsage(acc.usage, step, name, model!, context, traceId, completionDurationMs, slog);

      // No response at all
      if (!acc.content && acc.toolCalls.size === 0) {
        throw new Error(`[${name}] No response from LLM (streaming)`);
      }

      // Construct assistant message from accumulated data
      const toolCallsArray = accToolCallsToArray(acc);
      const assistantMessage: any = {
        role: 'assistant',
        content: acc.content || null,
        ...(toolCallsArray ? { tool_calls: toolCallsArray } : {}),
      };
      messages.push(assistantMessage);

      // Emit intermediate reasoning text
      if (acc.content && toolCallsArray?.length) {
        const text = acc.content.trim();
        if (text) {
          await log(`[${name}] Text: ${text.slice(0, 200)}`);
        }
      }

      // --- Handle tool calls ---
      if (toolCallsArray && toolCallsArray.length > 0) {
        // Phase 1: Pre-scan — handle exit tool & unknown tools before execution
        const executableCalls: Array<{ toolCall: typeof toolCallsArray[0]; tool: BaseTool }> = [];
        let earlyExit: Record<string, unknown> | null = null;

        for (const toolCall of toolCallsArray) {
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

          if (exitToolName && toolName === exitToolName) {
            try {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
              await log(`[${name}] Exit tool "${exitToolName}" called. Finishing.`);
              earlyExit = args;
              break;
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

          executableCalls.push({ toolCall, tool });
        }

        if (earlyExit) return earlyExit;

        // Phase 2: Decide execution mode
        const anyNeedsApproval = executableCalls.some(({ tool }) =>
          tool.requiresApproval && context.onApprovalRequired && (
            context.trustLevel === 'collaborative' || (
              context.trustLevel === 'standard' && tool.riskLevel !== 'low'
            )
          )
        );
        const canParallel = PARALLEL_TOOL_EXEC && !anyNeedsApproval && executableCalls.length >= 2;

        if (canParallel) {
          // --- Parallel execution path ---
          // Fire all onToolCallStart callbacks upfront
          for (const { toolCall, tool } of executableCalls) {
            context.onToolCallStart?.({
              toolName: tool.name,
              toolCallId: toolCall.id,
              args: toolCall.function.arguments.slice(0, 200),
            });
            await log(`[${name}] Action: ${tool.name}(${toolCall.function.arguments.slice(0, 100)})`);
          }

          // Execute all tools concurrently
          const settled = await Promise.allSettled(
            executableCalls.map(async ({ toolCall, tool }) => {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
              const result = await tool.execute(args, toolCtx);
              return result;
            })
          );

          // Process results in original order
          for (let i = 0; i < settled.length; i++) {
            const { toolCall, tool } = executableCalls[i];
            const outcome = settled[i];
            let resultStr: string;

            if (outcome.status === 'fulfilled') {
              const result = outcome.value;
              if (result.success) {
                resultStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
              } else {
                resultStr = `Error: ${result.error}`;
              }
            } else {
              const reason = outcome.reason;
              const isTimeout = reason instanceof Error && (reason.message.includes('timeout') || reason.message.includes('ETIMEDOUT'));
              const isRateLimit = reason instanceof Error && (reason.message.includes('429') || reason.message.includes('rate limit'));
              const errorType = isTimeout ? 'TIMEOUT' : isRateLimit ? 'RATE_LIMIT' : 'EXECUTION_ERROR';
              const errorMsg = reason instanceof Error ? reason.message : String(reason);
              console.error(`[${name}] Tool "${tool.name}" ${errorType}:`, reason);
              resultStr = `Error executing tool (${errorType}): ${errorMsg}`;
            }

            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });

            let markerMatch: RegExpExecArray | null;
            MARKER_RE.lastIndex = 0;
            while ((markerMatch = MARKER_RE.exec(resultStr)) !== null) {
              collectedMarkers.push(markerMatch[0]);
            }

            const isError = resultStr.startsWith('Error');
            const preview = resultStr.slice(0, 150).replace(/\n/g, ' ');
            await log(`[${name}] Result: ${tool.name} | ${isError ? 'ERROR' : 'OK'} | ${preview}`);

            context.onToolCallEnd?.({
              toolName: tool.name,
              toolCallId: toolCall.id,
              result: preview,
              success: !isError,
            });

            if (tool.name === 'code_edit' && resultStr.includes('File not found')) {
              messages.push({
                role: 'user',
                content: '⚠️ 上面的 code_edit 调用失败了，因为文件不存在。你必须改用 code_write 来创建这个新文件，不要再次尝试 code_edit。',
              });
            }
          }
        } else {
          // --- Sequential execution path (approval needed or single tool) ---
          for (const { toolCall, tool } of executableCalls) {
            const toolName = tool.name;

            context.onToolCallStart?.({
              toolName,
              toolCallId: toolCall.id,
              args: toolCall.function.arguments.slice(0, 200),
            });

            await log(`[${name}] Action: ${toolName}(${toolCall.function.arguments.slice(0, 100)})`);
            let resultStr = '';
            try {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);

              const needsApproval = tool.requiresApproval && context.onApprovalRequired && (
                context.trustLevel === 'collaborative' || (
                  context.trustLevel === 'standard' && tool.riskLevel !== 'low'
                )
              );
              if (needsApproval) {
                const approved = await context.onApprovalRequired!({
                  toolName,
                  toolArgs: args,
                  agentName: name,
                });
                if (!approved) {
                  resultStr = 'Tool execution was rejected by the user. Adjust your plan accordingly.';
                  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });
                  context.onToolCallEnd?.({ toolName, toolCallId: toolCall.id, result: resultStr, success: false });
                  continue;
                }
              }

              const result = await tool.execute(args, toolCtx);
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

            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });

            let markerMatch: RegExpExecArray | null;
            MARKER_RE.lastIndex = 0;
            while ((markerMatch = MARKER_RE.exec(resultStr)) !== null) {
              collectedMarkers.push(markerMatch[0]);
            }

            const isError = resultStr.startsWith('Error');
            const preview = resultStr.slice(0, 150).replace(/\n/g, ' ');
            await log(`[${name}] Result: ${toolName} | ${isError ? 'ERROR' : 'OK'} | ${preview}`);

            context.onToolCallEnd?.({
              toolName,
              toolCallId: toolCall.id,
              result: preview,
              success: !isError,
            });

            if (toolName === 'code_edit' && resultStr.includes('File not found')) {
              messages.push({
                role: 'user',
                content: '⚠️ 上面的 code_edit 调用失败了，因为文件不存在。你必须改用 code_write 来创建这个新文件，不要再次尝试 code_edit。',
              });
            }
          }
        }

        // Checkpoint
        if (context.onCheckpoint) {
          context.onCheckpoint({ messages: [...messages], stepsCompleted: step + 1 });
        }

        // Remaining steps warning
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

      // --- No tool calls: text response ---
      if (acc.content) {
        if (exitToolName && openAITools) {
          await log(`[${name}] Model returned text instead of calling "${exitToolName}". Forcing exit tool call...`);
          messages.push({ role: 'assistant', content: acc.content });
          messages.push({
            role: 'user',
            content: `You must call "${exitToolName}" to return your result as structured data. Do NOT reply with plain text. Call the tool NOW.`,
          });
          try {
            const forced = await this.createCompletionWithFailover(
              {
                model: model!,
                messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
                tools: openAITools,
                tool_choice: { type: 'function', function: { name: exitToolName } },
              },
              `${name}.force-exit`,
              { projectId: context.projectId, agentName: name, model: model! },
            );
            const forcedMsg = forced.choices[0]?.message;
            if (forcedMsg?.tool_calls?.[0]) {
              const args = JSON.parse(forcedMsg.tool_calls[0].function.arguments);
              await log(`[${name}] Exit tool "${exitToolName}" called via forced retry. Finishing.`);
              return args;
            }
          } catch (forcedErr) {
            await log(`[${name}] Forced exit tool call failed: ${forcedErr instanceof Error ? forcedErr.message : String(forcedErr)}`);
          }
        }

        await log(`[${name}] Completed with text response.`);
        // Only attempt JSON parsing when agent has an exit tool (subagents
        // returning structured data).  For chat agents whose response is
        // markdown, blindly running cleanJSON would extract an embedded JSON
        // code-block and discard the surrounding text — causing extractResponse
        // to fail with the "unable to generate" fallback.
        if (exitToolName && openAITools) {
          try {
            const cleaned = cleanJSON(acc.content);
            return JSON.parse(cleaned);
          } catch {
            /* fall through to plain text return */
          }
        }
        if (collectedMarkers.length > 0) {
          return collectedMarkers.join('\n') + '\n' + acc.content;
        }
        return acc.content;
      }
    }

    // --- Max loops reached (same as run()) ---
    await log(`[${name}] Max loops (${maxLoops}) reached. Attempting to extract result from conversation...`);

    let extractedResult: Record<string, any> | undefined;

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
        this._recordUsage(lastChance.usage, maxLoops!, name, model!, context, traceId, lastChanceDurationMs, slog);

        const lcMsg = lastChance.choices[0]?.message;
        if (lcMsg?.tool_calls?.[0]) {
          try {
            extractedResult = JSON.parse(lcMsg.tool_calls[0].function.arguments);
            await log(`[${name}] Extracted result via forced exit tool call.`);
          } catch (parseErr: unknown) {
            const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            await log(`[${name}] Failed to parse last-chance exit tool arguments: ${parseMsg}`);
          }
        }
      } catch {
        /* fall through to text extraction */
      }
    }

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
   * Full ReAct loop with OpenAI function calling (non-streaming).
   * Used by subagents and teammates that don't need token streaming.
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

    // Build ToolContext for this run — shared across all tool calls in the session
    const toolCtx = tools.length > 0
      ? createToolContext({
          agentName: name,
          agentContext: context,
          tools,
          workspacePath: context.workspacePath,
          poolTags: this.config.poolTags,
          model: model!,
        })
      : undefined;

    // Collect structured markers emitted by tools (e.g. [[QUESTION_DATA]]...[[/QUESTION_DATA]])
    // so they can be prepended to the final text response for chat-engine to parse.
    const collectedMarkers: string[] = [];
    const MARKER_RE = /\[\[(?:QUESTION_DATA|PLAN_MODE_ENTER|PLAN_REVIEW|TEAM_UPGRADE)\]\][\s\S]*?\[\[\/(?:QUESTION_DATA|PLAN_MODE_ENTER|PLAN_REVIEW|TEAM_UPGRADE)\]\]/g;
    let upgradeOffered = false;
    let adaptiveDelay = INTER_STEP_DELAY_MS;

    for (let step = 0; step < maxLoops!; step++) {
      if (step > 0 && adaptiveDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
      }

      // Check for user-injected messages (per-mate chat)
      if (context.onUserMessageCheck) {
        const injectedMsg = await context.onUserMessageCheck();
        if (injectedMsg) {
          messages.push({ role: 'user', content: `[User Feedback]: ${injectedMsg}` });
          await log(`[${name}] Received user feedback: ${injectedMsg.slice(0, 100)}`);
        }
      }

      await log(`[${name}] Step ${step + 1}: Thinking...`);

      // --- Team upgrade check: offer before compaction if ≥75% context used ---
      if (!upgradeOffered && context.onCompactionUpgradeRequired && contextBudget.needsUpgrade(messages)) {
        upgradeOffered = true;
        const ratio = contextBudget.usageRatio(messages);
        const estimated = contextBudget.measure(messages);
        await log(`[${name}] Context usage at ${(ratio * 100).toFixed(0)}% — offering Team upgrade...`);

        const approved = await context.onCompactionUpgradeRequired({
          tokenUsage: { estimated, max: contextBudget.maxTokens, ratio },
        });

        if (approved) {
          await log(`[${name}] Team upgrade approved. Generating state summary...`);
          const stateSummary = await generateStateSummary(messages, name);
          const markerData = JSON.stringify({ stateSummary });
          if (collectedMarkers.length > 0) {
            return collectedMarkers.join('\n') + '\n'
              + `[[TEAM_UPGRADE]]${markerData}[[/TEAM_UPGRADE]]\n\n正在升级为团队模式。每个子智能体将成为拥有独立上下文窗口的队友，以更好地完成任务。`;
          }
          return `[[TEAM_UPGRADE]]${markerData}[[/TEAM_UPGRADE]]\n\n正在升级为团队模式。每个子智能体将成为拥有独立上下文窗口的队友，以更好地完成任务。`;
        }
        // If rejected, fall through to normal compression + LLM call
      }

      // --- Model routing: fast model for intermediate tool-calling steps ---
      const fastModelId = this.config.fastModel || FAST_MODEL;
      const isFirstStep = step === 0;
      const isNearEnd = exitToolName && (maxLoops! - step) <= 2;
      const stepModel = (fastModelId && !isFirstStep && !isNearEnd) ? fastModelId : model!;
      if (stepModel !== model!) {
        await log(`[${name}] Step ${step + 1}: Using fast model "${stepModel}"`);
      }

      const completionStartAt = Date.now();
      let completion: any;
      try {
        completion = await this.createCompletionWithFailover(
          {
            model: stepModel,
            messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
            ...(openAITools ? { tools: openAITools, tool_choice: 'auto' } : {}),
          },
          `${name}.step-${step + 1}`,
          { projectId: context.projectId, agentName: name, model: stepModel },
        );
      } catch (llmErr: any) {
        const is429 = llmErr.message?.includes('429') || llmErr.status === 429;
        if (is429 && step < maxLoops! - 1) {
          adaptiveDelay = Math.min(Math.max(adaptiveDelay * 2, 2000), MAX_BACKOFF_MS);
          await log(`[${name}] Rate limited (429) at step ${step + 1}. Backing off ${adaptiveDelay}ms before retry.`);
          continue;
        }
        throw llmErr;
      }
      const completionDurationMs = Date.now() - completionStartAt;

      // Successful LLM call — decay adaptive delay back toward base
      if (adaptiveDelay > INTER_STEP_DELAY_MS) {
        adaptiveDelay = Math.max(INTER_STEP_DELAY_MS, Math.floor(adaptiveDelay / 2));
      }

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
        // Phase 1: Pre-scan — handle exit tool & unknown tools before execution
        const executableCalls: Array<{ toolCall: typeof message.tool_calls[0]; tool: BaseTool }> = [];
        let earlyExit: Record<string, unknown> | null = null;

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

          if (exitToolName && toolName === exitToolName) {
            try {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
              await log(`[${name}] Exit tool "${exitToolName}" called. Finishing.`);
              earlyExit = args;
              break;
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

          executableCalls.push({ toolCall, tool });
        }

        if (earlyExit) return earlyExit;

        // Phase 2: Decide execution mode
        const anyNeedsApproval = executableCalls.some(({ tool }) =>
          tool.requiresApproval && context.onApprovalRequired && (
            context.trustLevel === 'collaborative' || (
              context.trustLevel === 'standard' && tool.riskLevel !== 'low'
            )
          )
        );
        const canParallel = PARALLEL_TOOL_EXEC && !anyNeedsApproval && executableCalls.length >= 2;

        if (canParallel) {
          // --- Parallel execution path ---
          for (const { toolCall, tool } of executableCalls) {
            await log(`[${name}] Action: ${tool.name}(${toolCall.function.arguments.slice(0, 100)})`);
          }

          const settled = await Promise.allSettled(
            executableCalls.map(async ({ toolCall, tool }) => {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
              const result = await tool.execute(args, toolCtx);
              return result;
            })
          );

          for (let i = 0; i < settled.length; i++) {
            const { toolCall, tool } = executableCalls[i];
            const outcome = settled[i];
            let resultStr: string;

            if (outcome.status === 'fulfilled') {
              const result = outcome.value;
              if (result.success) {
                resultStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
              } else {
                resultStr = `Error: ${result.error}`;
              }
            } else {
              const reason = outcome.reason;
              const isTimeout = reason instanceof Error && (reason.message.includes('timeout') || reason.message.includes('ETIMEDOUT'));
              const isRateLimit = reason instanceof Error && (reason.message.includes('429') || reason.message.includes('rate limit'));
              const errorType = isTimeout ? 'TIMEOUT' : isRateLimit ? 'RATE_LIMIT' : 'EXECUTION_ERROR';
              const errorMsg = reason instanceof Error ? reason.message : String(reason);
              console.error(`[${name}] Tool "${tool.name}" ${errorType}:`, reason);
              resultStr = `Error executing tool (${errorType}): ${errorMsg}`;
            }

            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });

            let markerMatch: RegExpExecArray | null;
            MARKER_RE.lastIndex = 0;
            while ((markerMatch = MARKER_RE.exec(resultStr)) !== null) {
              collectedMarkers.push(markerMatch[0]);
            }

            const isError = resultStr.startsWith('Error');
            const preview = resultStr.slice(0, 150).replace(/\n/g, ' ');
            await log(`[${name}] Result: ${tool.name} | ${isError ? 'ERROR' : 'OK'} | ${preview}`);

            if (tool.name === 'code_edit' && resultStr.includes('File not found')) {
              messages.push({
                role: 'user',
                content: '⚠️ 上面的 code_edit 调用失败了，因为文件不存在。你必须改用 code_write 来创建这个新文件，不要再次尝试 code_edit。',
              });
            }
          }
        } else {
          // --- Sequential execution path (approval needed or single tool) ---
          for (const { toolCall, tool } of executableCalls) {
            const toolName = tool.name;

            await log(`[${name}] Action: ${toolName}(${toolCall.function.arguments.slice(0, 100)})`);
            let resultStr = '';
            try {
              const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);

              const needsApproval = tool.requiresApproval && context.onApprovalRequired && (
                context.trustLevel === 'collaborative' || (
                  context.trustLevel === 'standard' && tool.riskLevel !== 'low'
                )
              );
              if (needsApproval) {
                const approved = await context.onApprovalRequired!({
                  toolName,
                  toolArgs: args,
                  agentName: name,
                });
                if (!approved) {
                  resultStr = 'Tool execution was rejected by the user. Adjust your plan accordingly.';
                  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });
                  continue;
                }
              }

              const result = await tool.execute(args, toolCtx);
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

            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });

            let markerMatch: RegExpExecArray | null;
            MARKER_RE.lastIndex = 0;
            while ((markerMatch = MARKER_RE.exec(resultStr)) !== null) {
              collectedMarkers.push(markerMatch[0]);
            }

            const isError = resultStr.startsWith('Error');
            const preview = resultStr.slice(0, 150).replace(/\n/g, ' ');
            await log(`[${name}] Result: ${toolName} | ${isError ? 'ERROR' : 'OK'} | ${preview}`);

            if (toolName === 'code_edit' && resultStr.includes('File not found')) {
              messages.push({
                role: 'user',
                content: '⚠️ 上面的 code_edit 调用失败了，因为文件不存在。你必须改用 code_write 来创建这个新文件，不要再次尝试 code_edit。',
              });
            }
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
        // If an exit tool is expected, the model should have called it instead of
        // returning plain text.  Force one extra LLM call with tool_choice to
        // coerce a structured result before falling back to a raw string.
        if (exitToolName && openAITools) {
          await log(`[${name}] Model returned text instead of calling "${exitToolName}". Forcing exit tool call...`);
          messages.push({ role: 'assistant', content: message.content });
          messages.push({
            role: 'user',
            content: `You must call "${exitToolName}" to return your result as structured data. Do NOT reply with plain text. Call the tool NOW.`,
          });
          try {
            const forced = await this.createCompletionWithFailover(
              {
                model: model!,
                messages: await compressContext(messages, MAX_CONTEXT_MESSAGES),
                tools: openAITools,
                tool_choice: { type: 'function', function: { name: exitToolName } },
              },
              `${name}.force-exit`,
              { projectId: context.projectId, agentName: name, model: model! },
            );
            const forcedMsg = forced.choices[0]?.message;
            if (forcedMsg?.tool_calls?.[0]) {
              const args = JSON.parse(forcedMsg.tool_calls[0].function.arguments);
              await log(`[${name}] Exit tool "${exitToolName}" called via forced retry. Finishing.`);
              return args;
            }
          } catch (forcedErr) {
            await log(`[${name}] Forced exit tool call failed: ${forcedErr instanceof Error ? forcedErr.message : String(forcedErr)}`);
          }
        }

        await log(`[${name}] Completed with text response.`);
        try {
          const cleaned = cleanJSON(message.content);
          return JSON.parse(cleaned);
        } catch {
          // Prepend any structured markers collected from tool results
          // so chat-engine's parseStructuredMarkers() can find them.
          if (collectedMarkers.length > 0) {
            return collectedMarkers.join('\n') + '\n' + message.content;
          }
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
