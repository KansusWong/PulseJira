/**
 * Chat Engine — core orchestration layer for the Chat-First architecture.
 *
 * Handles the full lifecycle:
 * 1. Receive user message
 * 2. Assess complexity (L1/L2/L3)
 * 3. Route to appropriate executor based on execution mode
 * 4. Stream responses back via async generators
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { assessComplexity } from '@/agents/chat-judge';
import { createChatAssistantAgent } from '@/agents/chat-assistant';
import { getPreferences } from '@/lib/services/preferences-store';
import { messageBus } from '@/connectors/bus/message-bus';
import { runDecisionPhase, runArchitectPhase } from '@/skills/meta-pipeline';
import { hasAgentFactory, getAgentFactoryIds } from '@/lib/tools/spawn-agent';
import { ensureDynamicAgentsLoaded } from '@/lib/config/dynamic-agents';
import { SpawnSubAgentTool, createDefaultBudget } from '@/lib/tools/spawn-sub-agent';
import { ListAgentsTool } from '@/lib/tools/list-agents';
import { BaseAgent } from '@/lib/core/base-agent';
import { createProject, getProject } from '@/projects/project-service';
import { EventChannel } from '@/lib/utils/event-channel';
import { toolApprovalService } from '@/lib/services/tool-approval';
import { recordToolApprovalEvent } from '@/lib/services/tool-approval-audit';
import { Blackboard } from '@/lib/blackboard';
import { emitWebhookEvent } from '@/lib/services/webhook';
import { teamCoordinator } from '@/lib/services/team-coordinator';
import { getEnvironmentContext } from '@/lib/utils/environment';
import type {
  Conversation,
  ChatMessage,
  ComplexityAssessment,
  DecisionOutput,
  ExecutionMode,
  ChatEvent,
  StructuredRequirements,
  ArchitectCheckpoint,
  ArchitectResult,
} from '@/lib/core/types';

// ---------------------------------------------------------------------------
// Chat context for executor routing
// ---------------------------------------------------------------------------

interface ChatContext {
  conversation: Conversation;
  messages: ChatMessage[];
  userMessage: string;
  assessment: ComplexityAssessment | null;
}

/** Number of new user messages after which we re-assess complexity. */
const REASSESS_MESSAGE_THRESHOLD = 5;

/** Maximum clarification rounds for L3. */
const MAX_CLARIFICATION_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Clarification agent prompt
// ---------------------------------------------------------------------------

const CLARIFICATION_SYSTEM_PROMPT = `You are a Requirement Clarification assistant. Your job is to analyze a user's request and determine if you have enough information to create a detailed project specification.

You will receive the original request plus any previous clarification Q&A.

You MUST respond with a valid JSON object:

If the requirements are CLEAR ENOUGH to proceed:
{
  "status": "ready",
  "requirements": {
    "summary": "Concise description of what needs to be built",
    "goals": ["Goal 1", "Goal 2"],
    "scope": "Technical scope description",
    "constraints": ["Constraint 1", "Constraint 2"],
    "suggested_name": "project-name-slug"
  }
}

If the requirements are NOT clear enough and you need to ask a question:
{
  "status": "needs_clarification",
  "question": "Your specific clarifying question here"
}

Guidelines:
- Ask ONE focused question at a time, not multiple
- Focus on: target users, key features, technical constraints, scale expectations, quality requirements
- Be conversational and concise
- After receiving enough context (usually 1-2 answers), declare "ready"
- When forced to produce requirements (round >= 3), always output "ready" with best-effort requirements`;

// ---------------------------------------------------------------------------
// ChatEngine
// ---------------------------------------------------------------------------

export class ChatEngine {
  /**
   * Build environment context string for agent system prompts.
   * Delegates to the standalone utility to avoid circular dependencies.
   */
  static getEnvironmentContext(): string {
    return getEnvironmentContext();
  }

  /**
   * Extract a clean text response from agent result.
   * Handles string results, object results, and __incomplete fallback.
   */
  static extractResponse(result: any): string {
    // Normal string response
    if (typeof result === 'string') return result;

    // Object with content/response field
    if (result?.content && typeof result.content === 'string') return result.content;
    if (result?.response && typeof result.response === 'string') return result.response;

    // Agent hit maxLoops (__incomplete) — extract last assistant text from messages
    if (result?.__incomplete && Array.isArray(result.__messages)) {
      // Find the last assistant message with actual text content
      for (let i = result.__messages.length - 1; i >= 0; i--) {
        const msg = result.__messages[i];
        if (msg.role === 'assistant' && msg.content && typeof msg.content === 'string') {
          return msg.content;
        }
      }
      // No assistant text found — summarize from tool results
      const toolResults = result.__messages
        .filter((m: any) => m.role === 'tool' && m.content)
        .map((m: any) => m.content)
        .join('\n');
      if (toolResults) {
        return `Based on search results, here is what I found:\n\n${toolResults.slice(0, 3000)}`;
      }
    }

    return 'Sorry, I was unable to generate a response. Please try again.';
  }

  /**
   * Main entry point: handle a user message and yield SSE events.
   */
  async *handleMessage(
    conversationId: string,
    message: string,
  ): AsyncGenerator<ChatEvent> {
    // 1. Load or create conversation
    const conversation = await this.getOrCreateConversation(conversationId);

    // 2. Save user message
    await this.saveMessage(conversation.id, 'user', message);

    // 3. Load conversation history
    const history = await this.getMessages(conversation.id);

    // 4. Check if we're in an active clarification flow
    const clarRound = conversation.clarification_round ?? 0;
    const inClarification = clarRound > 0 && clarRound < MAX_CLARIFICATION_ROUNDS
      && conversation.execution_mode === 'agent_team';

    if (inClarification) {
      // Continue clarification — update context with user's answer
      const clarCtx = conversation.clarification_context ?? { questions: [], answers: [] };
      clarCtx.answers.push(message);
      await this.updateConversation(conversation.id, {
        clarification_context: clarCtx,
      } as any);
      conversation.clarification_context = clarCtx;

      yield* this.handleClarification({
        conversation,
        messages: history,
        userMessage: message,
        assessment: conversation.complexity_assessment,
      });

      yield { type: 'done', data: { conversation_id: conversation.id } };
      return;
    }

    // 5. Assess complexity (on first message, or re-assess if stale)
    let assessment = conversation.complexity_assessment;
    const assessedAtCount = (conversation as any).assessed_at_message_count ?? 0;
    const userMessageCount = history.filter(m => m.role === 'user').length;
    const shouldReassess = !assessment || (userMessageCount - assessedAtCount >= REASSESS_MESSAGE_THRESHOLD);

    if (shouldReassess) {
      yield { type: 'agent_log', data: { message: '正在评估请求复杂度...' } };
      try {
        const historyStr = history
          .slice(0, -1) // exclude current message
          .map(m => `[${m.role}]: ${m.content.slice(0, 200)}`)
          .join('\n');
        assessment = await assessComplexity(message, historyStr || undefined);

        // Update conversation with assessment + message count snapshot
        await this.updateConversation(conversation.id, {
          complexity_assessment: assessment,
          execution_mode: assessment.execution_mode,
          title: conversation.title || message.slice(0, 80),
          assessed_at_message_count: userMessageCount,
        } as any);

        conversation.complexity_assessment = assessment;
        conversation.execution_mode = assessment.execution_mode;

        // Only L3 (agent_team) shows PlanPanel for approval; L2 executes directly
        if (assessment.execution_mode === 'agent_team') {
          yield { type: 'plan_assessment', data: assessment };
        }
      } catch {
        // Default to direct on assessment failure
        assessment = {
          complexity_level: 'L1',
          execution_mode: 'direct',
          rationale: 'Assessment failed, defaulting to direct answer.',
          suggested_agents: [],
          estimated_steps: 1,
          plan_outline: [],
          requires_project: false,
          requires_clarification: false,
        };
      }
    }

    // 6. Route to executor
    const context: ChatContext = {
      conversation,
      messages: history,
      userMessage: message,
      assessment,
    };

    const mode = assessment!.execution_mode;

    if (mode === 'direct') {
      // L1: Direct LLM answer
      yield* this.handleDirect(context);
    } else if (mode === 'single_agent') {
      // L2: Create light project + single agent execution
      yield* this.handleSingleAgentWithProject(context);
    } else if (mode === 'agent_team') {
      // L3: Check if clarification needed
      if (assessment!.requires_clarification) {
        // Initialize clarification flow
        await this.updateConversation(conversation.id, {
          clarification_round: 0,
          clarification_context: { questions: [], answers: [] },
        } as any);
        conversation.clarification_round = 0;
        conversation.clarification_context = { questions: [], answers: [] };

        yield* this.handleClarification(context);
      } else {
        // Requirements clear — yield plan for approval
        yield {
          type: 'plan_update',
          data: {
            status: 'pending_approval',
            mode,
            assessment,
            plan_outline: assessment!.plan_outline,
          },
        };
      }
    } else {
      // Fallback: direct answer
      yield* this.handleDirect(context);
    }

    yield { type: 'done', data: { conversation_id: conversation.id } };
  }

  /**
   * Execute an approved plan (called after user approves via Plan Panel).
   */
  async *executePlan(
    conversationId: string,
    mode: ExecutionMode,
  ): AsyncGenerator<ChatEvent> {
    const conversation = await this.getOrCreateConversation(conversationId);
    const messages = await this.getMessages(conversationId);
    const assessment = conversation.complexity_assessment;

    const context: ChatContext = {
      conversation,
      messages,
      userMessage: messages.filter(m => m.role === 'user').pop()?.content || '',
      assessment,
    };

    if (mode === 'agent_team') {
      yield* this.handleAgentTeam(context);
    } else if (mode === 'single_agent') {
      yield* this.handleSingleAgentWithProject(context);
    } else {
      yield* this.handleDirect(context);
    }

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  /**
   * Confirm requirements from clarification form and execute agent team.
   */
  async *confirmAndExecute(
    conversationId: string,
    requirements: StructuredRequirements,
  ): AsyncGenerator<ChatEvent> {
    const conversation = await this.getOrCreateConversation(conversationId);

    let projectId = conversation.project_id;

    if (!projectId) {
      // Normal chat flow: create a new project from requirements
      yield { type: 'agent_log', data: { message: '正在创建项目...' } };

      const project = await createProject({
        name: requirements.suggested_name || 'Untitled Project',
        description: requirements.summary,
        is_light: false,
        conversation_id: conversationId,
      });

      projectId = project.id;

      yield {
        type: 'project_created',
        data: { project_id: project.id, name: project.name, is_light: false },
      };
    } else {
      // Signal pipeline: project already exists, skip creation
      yield { type: 'agent_log', data: { message: '使用已有项目...' } };
    }

    // Link conversation to project + store structured requirements
    await this.updateConversation(conversation.id, {
      project_id: projectId,
      status: 'converted',
      structured_requirements: requirements,
    } as any);

    // Build context and execute agent team
    const messages = await this.getMessages(conversationId);
    const assessment = conversation.complexity_assessment;

    const context: ChatContext = {
      conversation: { ...conversation, project_id: projectId, structured_requirements: requirements },
      messages,
      userMessage: requirements.summary,
      assessment,
    };

    yield* this.handleAgentTeam(context);

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  // ---------------------------------------------------------------------------
  // Execution mode handlers
  // ---------------------------------------------------------------------------

  /**
   * L1 Direct mode — lightweight chat with tool access.
   * No project creation.
   */
  private async *handleDirect(context: ChatContext): AsyncGenerator<ChatEvent> {
    const channel = new EventChannel<ChatEvent>();

    try {
      const channelLogger = (msg: string) => {
        const friendly = this.transformAgentLog(msg);
        if (friendly) {
          channel.push({ type: 'agent_log', data: { message: friendly } });
        }
      };

      const agent = createChatAssistantAgent();

      const historyContext = context.messages
        .slice(-10)
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n\n');

      const agentPromise = agent.run(
        `${historyContext}\n\n[user]: ${context.userMessage}`,
        { logger: channelLogger },
      );

      agentPromise
        .then(async (result) => {
          const responseText = ChatEngine.extractResponse(result);
          await this.saveMessage(context.conversation.id, 'assistant', responseText).catch((err) =>
            console.error('[ChatEngine] Save direct response failed:', err));
          channel.push({ type: 'message', data: { role: 'assistant', content: responseText } });
          channel.close();
        })
        .catch(async (error: unknown) => {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          channel.push({ type: 'error', data: { message: errorMsg } });
          channel.close();
        });

      for await (const event of channel) {
        yield event;
      }

      await agentPromise.catch(() => {});
    } catch (error: any) {
      channel.close();
      yield { type: 'error', data: { message: error.message } };
    }
  }

  /**
   * Transform internal BaseAgent English log messages into user-friendly Chinese progress text.
   * Returns null for internal messages that should not be displayed.
   */
  private transformAgentLog(message: string): string | null {
    // "[chat-assistant] Step N: Thinking..." → "💭 思考中...（第 N 步）"
    const stepMatch = message.match(/\[[\w-]+\] Step (\d+): Thinking/);
    if (stepMatch) return `💭 思考中...（第 ${stepMatch[1]} 步）`;

    // "[chat-assistant] Action: toolName({...args})" → Chinese label + key argument
    const actionMatch = message.match(/\[[\w-]+\] Action: (\w+)\(([\s\S]*)\)\s*$/);
    if (actionMatch) {
      const toolName = actionMatch[1];
      const rawArgs = actionMatch[2];

      // Try to extract a short human-readable summary from tool args
      let argSummary = '';
      try {
        const parsed = JSON.parse(rawArgs);
        if (toolName === 'web_search' && parsed.query) {
          argSummary = parsed.query;
        } else if (toolName === 'read_file' && parsed.path) {
          argSummary = parsed.path;
        } else if (toolName === 'list_files' && parsed.path) {
          argSummary = parsed.path;
        } else if ((toolName === 'spawn_sub_agent' || toolName === 'spawn_agent') && parsed.agent_name) {
          argSummary = parsed.agent_name;
        } else if ((toolName === 'code_write' || toolName === 'code_edit') && parsed.path) {
          argSummary = parsed.path;
        } else if (toolName === 'run_command' && parsed.command) {
          argSummary = parsed.command;
        } else if (toolName === 'rag_retrieve' && parsed.query) {
          argSummary = parsed.query;
        } else if ((toolName === 'search_vision_knowledge' || toolName === 'search_decisions' || toolName === 'search_code_artifacts' || toolName === 'search_code_patterns') && parsed.query) {
          argSummary = parsed.query;
        } else if (toolName === 'git_create_pr' && parsed.title) {
          argSummary = parsed.title;
        } else if (toolName === 'create_agent' && parsed.name) {
          argSummary = parsed.name;
        } else if (toolName === 'create_skill' && parsed.name) {
          argSummary = parsed.name;
        }
      } catch {
        // args not valid JSON, ignore
      }

      const labels: Record<string, string> = {
        web_search: '搜索',
        read_file: '读取文件',
        list_files: '浏览目录',
        spawn_sub_agent: '分派子任务',
        spawn_agent: '分派子任务',
        list_agents: '查看可用智能体',
        search_vision_knowledge: '检索知识库',
        search_decisions: '检索决策记录',
        search_code_artifacts: '检索代码产物',
        search_code_patterns: '检索代码模式',
        rag_retrieve: 'RAG 检索',
        code_write: '写入代码',
        code_edit: '编辑代码',
        git_commit: 'Git 提交',
        git_create_pr: '创建 PR',
        run_command: '执行命令',
        run_tests: '运行测试',
        validate_output: '验证输出',
        create_agent: '创建智能体',
        create_skill: '创建技能',
        fetch_daily_data: '获取日报数据',
        finish_planning: '完成规划',
        finish_implementation: '完成实现',
        finish_daily_report: '生成日报',
        discover_skills: '发现技能',
        blackboard_read: '读取黑板',
        blackboard_write: '写入黑板',
        merge_pr: '合并 PR',
        check_ci: '检查 CI',
        trigger_deploy: '触发部署',
        check_health: '健康检查',
        store_code_pattern: '存储代码模式',
      };
      const label = labels[toolName] || toolName;
      return argSummary ? `🔧 ${label}：${argSummary}` : `🔧 ${label}...`;
    }

    if (message.includes('Completed with text response')) return '✅ 正在整理结果...';
    if (message.includes('Max loops')) return '✅ 已达到最大步数，正在收尾...';
    if (message.includes('Exit tool')) return '✅ 任务即将完成...';

    return null; // suppress other internal messages
  }

  /**
   * L2 Single Agent mode — create light project, then execute with single agent.
   */
  private async *handleSingleAgentWithProject(context: ChatContext): AsyncGenerator<ChatEvent> {
    const channel = new EventChannel<ChatEvent>();
    const conversationId = context.conversation.id;

    try {
      // Reuse existing light project if conversation already has one
      let project: Awaited<ReturnType<typeof createProject>> | null = null;
      if (context.conversation.project_id) {
        const existing = await getProject(context.conversation.project_id);
        if (existing?.is_light) {
          project = existing;
        }
      }

      if (!project) {
        channel.push({ type: 'agent_log', data: { message: '正在创建轻量项目...' } });
        const projectName = context.userMessage.slice(0, 60).replace(/[^\w\s\u4e00-\u9fff-]/g, '').trim() || 'Light Task';
        project = await createProject({
          name: projectName,
          description: context.userMessage,
          is_light: true,
          conversation_id: conversationId,
        });

        // Link conversation to project
        await this.updateConversation(conversationId, {
          project_id: project.id,
        } as any);

        channel.push({
          type: 'project_created',
          data: { project_id: project.id, name: project.name, is_light: true },
        });
      }

      channel.push({ type: 'agent_log', data: { message: '正在分析任务...' } });

      // Sub-agent budget: allow up to 3 spawns, 15 total sub-agent loops
      const subAgentBudget = createDefaultBudget();

      // Channel-based logger: transforms internal English logs to Chinese progress
      const channelLogger = (msg: string) => {
        const friendly = this.transformAgentLog(msg);
        if (friendly) {
          channel.push({ type: 'agent_log', data: { message: friendly } });
        }
      };

      const agentContext: import('@/lib/core/types').AgentContext = {
        projectId: project.id,
        logger: channelLogger,
      };

      const agent = createChatAssistantAgent({
        mode: 'project',
        extraTools: [
          new ListAgentsTool(),
          new SpawnSubAgentTool(subAgentBudget, agentContext),
        ],
      });

      const historyContext = context.messages
        .slice(-10)
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n\n');

      // Subscribe to sub-agent events on the messageBus
      const unsubscribe = messageBus.subscribe('single-agent', (message) => {
        if (message.type === 'sub_agent_start') {
          channel.push({
            type: 'agent_log',
            data: { message: `子智能体「${message.payload?.agent_name || message.to}」启动中...` },
          });
        } else if (message.type === 'sub_agent_complete') {
          const status = message.payload?.status === 'success' ? '已完成' : '执行失败';
          channel.push({
            type: 'agent_log',
            data: { message: `子智能体「${message.payload?.agent_name || message.from}」${status}` },
          });
        }
      });

      // Run agent in background — push result/error to channel when done
      const agentPromise = agent.run(
        `${historyContext}\n\n[user]: ${context.userMessage}`,
        agentContext,
      );

      agentPromise
        .then(async (result) => {
          const responseText = ChatEngine.extractResponse(result);
          await this.saveMessage(conversationId, 'assistant', responseText).catch((err) =>
            console.error('[ChatEngine] Save single-agent response failed:', err));

          channel.push({
            type: 'message',
            data: { role: 'assistant', content: responseText },
          });
          channel.close();
          unsubscribe();
        })
        .catch(async (error: unknown) => {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          channel.push({ type: 'error', data: { message: errorMsg } });
          channel.close();
          unsubscribe();
        });

      // Consume events from channel and yield them as SSE
      for await (const event of channel) {
        yield event;
      }

      // Ensure agent promise has settled
      await agentPromise.catch(() => {});
    } catch (error: any) {
      channel.close();
      yield { type: 'error', data: { message: error.message } };
    }
  }

  /**
   * L3 Clarification handler — ask clarifying questions or produce structured form.
   */
  private async *handleClarification(context: ChatContext): AsyncGenerator<ChatEvent> {
    const round = context.conversation.clarification_round ?? 0;
    const clarCtx = context.conversation.clarification_context ?? { questions: [], answers: [] };

    yield { type: 'agent_log', data: { message: `正在澄清需求（第 ${round + 1}/${MAX_CLARIFICATION_ROUNDS} 轮）...` } };

    try {
      const agent = new BaseAgent({
        name: 'clarification-assistant',
        systemPrompt: CLARIFICATION_SYSTEM_PROMPT,
        tools: [],
        maxLoops: 1,
        model: process.env.LLM_MODEL_NAME ?? 'gpt-4o',
      });

      // Build context with all Q&A so far
      let clarificationHistory = `## Original Request\n${context.messages.filter(m => m.role === 'user')[0]?.content || context.userMessage}\n`;

      if (clarCtx.questions.length > 0) {
        clarificationHistory += '\n## Previous Clarification\n';
        for (let i = 0; i < clarCtx.questions.length; i++) {
          clarificationHistory += `Q${i + 1}: ${clarCtx.questions[i]}\n`;
          if (clarCtx.answers[i]) {
            clarificationHistory += `A${i + 1}: ${clarCtx.answers[i]}\n`;
          }
        }
      }

      // Force ready on final round
      if (round >= MAX_CLARIFICATION_ROUNDS - 1) {
        clarificationHistory += '\n## IMPORTANT: This is the final round. You MUST output status "ready" with best-effort requirements.';
      }

      const result = await agent.runOnce(clarificationHistory, {});

      if (result.status === 'ready' && result.requirements) {
        // Requirements ready — emit form
        yield {
          type: 'clarification_form',
          data: result.requirements as StructuredRequirements,
        };

        // Save a system message
        const formSummary = `**Requirements confirmed:**\n- ${result.requirements.summary}\n- Goals: ${result.requirements.goals?.join(', ')}`;
        await this.saveMessage(context.conversation.id, 'assistant', formSummary);

        yield {
          type: 'message',
          data: { role: 'assistant', content: formSummary },
        };
      } else if (result.status === 'needs_clarification' && result.question) {
        // Ask clarifying question
        const question = result.question;
        clarCtx.questions.push(question);

        await this.updateConversation(context.conversation.id, {
          clarification_round: round + 1,
          clarification_context: clarCtx,
        } as any);

        await this.saveMessage(context.conversation.id, 'assistant', question);

        yield {
          type: 'message',
          data: { role: 'assistant', content: question },
        };
      } else {
        // Unexpected output — force form generation
        const fallbackReqs: StructuredRequirements = {
          summary: context.userMessage,
          goals: ['Complete the requested task'],
          scope: 'To be determined',
          constraints: [],
          suggested_name: context.userMessage.slice(0, 40).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'new-project',
        };

        yield { type: 'clarification_form', data: fallbackReqs };
      }
    } catch (error: any) {
      yield { type: 'error', data: { message: error.message } };
    }
  }

  /**
   * Agent team mode — runs DM phase only, then waits for human approval.
   * Team record creation is deferred to handleArchitectPhase.
   */
  private async *handleAgentTeam(context: ChatContext): AsyncGenerator<ChatEvent> {
    // Lazy-load persisted dynamic agents — only needed for L3 team execution
    ensureDynamicAgentsLoaded();

    // Read user's agent execution mode preference
    let agentExecutionMode: 'simple' | 'medium' | 'advanced' = 'simple';
    try {
      const prefs = await getPreferences();
      agentExecutionMode = prefs.agentExecutionMode || 'simple';
    } catch {
      // Default to simple on failure
    }

    // 'advanced' falls back to 'medium' (not yet implemented)
    if (agentExecutionMode === 'advanced') {
      agentExecutionMode = 'medium';
    }

    const channel = new EventChannel<ChatEvent>();

    // Subscribe to messageBus agent-log to capture BaseAgent tool-call details
    const unsubLog = messageBus.onLog((message) => {
      if (message.type === 'agent_log' && message.payload?.message) {
        const friendly = this.transformAgentLog(message.payload.message);
        if (friendly) {
          channel.push({ type: 'agent_log', data: { message: friendly } });
        }
      }
    });

    try {
      // Create Blackboard scoped to this conversation (persists across DM → Architect)
      const blackboard = new Blackboard(context.conversation.id, context.conversation.project_id, { maxEntries: 200, ttlMs: 2 * 60 * 60 * 1000 });

      // Phase 1: Decision Maker only (background promise)
      const dmPromise = runDecisionPhase(context.userMessage, {
        projectId: context.conversation.project_id ?? undefined,
        structuredRequirements: context.conversation.structured_requirements ?? undefined,
        blackboard,
        logger: async (msg: string) => {
          const friendly = this.transformAgentLog(msg);
          channel.push({ type: 'agent_log', data: { message: friendly || msg } });
        },
      });

      dmPromise
        .then(async (decision) => {
          emitWebhookEvent({
            event: 'dm_decision_complete',
            title: `DM Decision: ${decision.decision}`,
            detail: `Confidence: ${decision.confidence} | Risk: ${decision.risk_level} | ${decision.summary}`,
            from: 'decision-maker',
          });

          const decisionText = `Decision: ${decision.decision} (confidence: ${decision.confidence})\nRisk: ${decision.risk_level}\n\n${decision.summary}`;

          // Save DM summary as chat message
          await this.saveMessage(context.conversation.id, 'assistant', decisionText).catch((err) =>
            console.error('[ChatEngine] Save DM response failed:', err));

          channel.push({ type: 'message', data: { role: 'assistant', content: decisionText } });

          if (decision.decision === 'PROCEED') {
            await this.updateConversation(context.conversation.id, {
              dm_decision: decision,
              dm_approval_status: 'pending',
            } as any);
            channel.push({ type: 'dm_decision', data: decision });
          } else {
            await this.updateConversation(context.conversation.id, {
              dm_decision: decision,
              dm_approval_status: null,
            } as any);
          }

          channel.close();
          unsubLog();
        })
        .catch(async (error: unknown) => {
          const errorMsg = `Decision Maker failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          await this.saveMessage(context.conversation.id, 'assistant', errorMsg).catch((err) =>
            console.error('[ChatEngine] Save DM error failed:', err));
          channel.push({ type: 'error', data: { message: errorMsg } });
          channel.close();
          unsubLog();
        });

      for await (const event of channel) {
        yield event;
      }

      await dmPromise.catch(() => {});
    } catch (error: any) {
      unsubLog();
      channel.close();
      const errorMsg = `Decision Maker failed: ${error.message}`;
      await this.saveMessage(context.conversation.id, 'assistant', errorMsg);
      yield { type: 'error', data: { message: errorMsg } };
    }
  }

  /**
   * Architect phase — creates team record, runs Architect, updates team status.
   * Called after DM approval.
   *
   * Uses EventChannel to bridge the async architect.run() with the SSE generator:
   * - Architect runs in the background (non-blocking promise)
   * - Agent logs and tool approval events are pushed to the channel
   * - This generator consumes events from the channel and yields them as SSE
   */
  private async *handleArchitectPhase(context: ChatContext): AsyncGenerator<ChatEvent> {
    // Create team record via coordinator (deferred from handleAgentTeam)
    const suggestedAgents = context.assessment?.suggested_agents || [];
    const team = await teamCoordinator.formTeam({
      conversationId: context.conversation.id,
      projectId: context.conversation.project_id ?? undefined,
      teamName: `team-${Date.now()}`,
      leadAgent: 'architect',
      members: suggestedAgents,
      executionMode: context.assessment?.execution_mode || 'agent_team',
    });
    const teamId = team.id;

    yield {
      type: 'team_update',
      data: {
        team_id: teamId,
        status: 'active',
        agents: suggestedAgents,
      },
    };

    emitWebhookEvent({
      event: 'architect_started',
      title: 'Architect Phase Started',
      detail: `Architect phase starting for conversation ${context.conversation.id}`,
      from: 'architect',
    });

    // Mark architect as working
    await teamCoordinator.updateAgentStatus(teamId, 'architect', 'working').catch(() => {});

    const channel = new EventChannel<ChatEvent>();

    // Subscribe to messageBus agent-log to capture BaseAgent tool-call details
    const unsubLog = messageBus.onLog((message) => {
      if (message.type === 'agent_log' && message.payload?.message) {
        const friendly = this.transformAgentLog(message.payload.message);
        if (friendly) {
          channel.push({ type: 'agent_log', data: { message: friendly } });
        }
      }
    });

    try {
      const dmDecision = context.conversation.dm_decision as DecisionOutput | undefined;
      const conversationId = context.conversation.id;
      const projectId = context.conversation.project_id;

      // Blackboard: create + hydrate from DB (restores DM-phase writes)
      const blackboard = new Blackboard(conversationId, projectId, { maxEntries: 200, ttlMs: 2 * 60 * 60 * 1000 });
      await blackboard.hydrate();

      // Fallback seed: if hydrate didn't find dm.decision (DB write still in-flight), seed from conversation record
      if (!blackboard.read('dm.decision') && dmDecision) {
        await blackboard.write({
          key: 'dm.decision',
          value: dmDecision,
          type: 'decision',
          author: 'decision_maker',
          tags: ['dm', 'decision', dmDecision.decision.toLowerCase()],
        });
      }

      // Fallback seed: structured requirements
      if (!blackboard.read('pipeline.requirements') && context.conversation.structured_requirements) {
        await blackboard.write({
          key: 'pipeline.requirements',
          value: { structuredRequirements: context.conversation.structured_requirements },
          type: 'context',
          author: 'meta-pipeline',
          tags: ['pipeline', 'requirements'],
        });
      }

      channel.push({ type: 'agent_log', data: { message: `Blackboard hydrated: ${blackboard.size} entries` } });

      // Define onApprovalRequired callback — pushes event to channel, blocks agent thread
      const onApprovalRequired = async (params: {
        toolName: string;
        toolArgs: Record<string, any>;
        agentName: string;
      }): Promise<boolean> => {
        const approvalId = crypto.randomUUID();

        // Store pending approval in conversation for persistence
        await this.updateConversation(conversationId, {
          pending_tool_approval: {
            approval_id: approvalId,
            tool_name: params.toolName,
            tool_args: params.toolArgs,
            agent_name: params.agentName,
            requested_at: new Date().toISOString(),
          },
        } as any);

        // Record 'requested' audit event (fire-and-forget)
        recordToolApprovalEvent({
          approvalId,
          conversationId,
          agentName: params.agentName,
          toolName: params.toolName,
          toolArgs: params.toolArgs,
          status: 'requested',
        }).catch(() => {});

        // Push approval-required event to SSE channel
        channel.push({
          type: 'tool_approval_required',
          data: {
            approval_id: approvalId,
            tool_name: params.toolName,
            tool_args: params.toolArgs,
            agent_name: params.agentName,
          },
        });

        // Block agent thread until resolved
        const { promise } = toolApprovalService.requestApproval({
          approvalId,
          toolName: params.toolName,
          agentName: params.agentName,
          conversationId,
        });

        const approved = await promise;

        // Clear pending approval from conversation
        await this.updateConversation(conversationId, {
          pending_tool_approval: null,
        } as any);

        // Push resolution event
        channel.push({
          type: 'tool_approval_resolved',
          data: { approval_id: approvalId, approved },
        });

        return approved;
      };

      // --- Execution mode: medium allows dynamic project-specific agent creation ---
      let execMode: 'simple' | 'medium' | 'advanced' = 'simple';
      try {
        const prefs = await getPreferences();
        execMode = prefs.agentExecutionMode || 'simple';
      } catch {
        // Default to simple on failure
      }
      if (execMode === 'advanced') {
        execMode = 'medium';
      }
      if (execMode === 'medium') {
        await blackboard.write({
          key: 'pipeline.executionMode',
          value: { mode: 'medium', allowDynamicAgents: true, projectId: context.conversation.project_id },
          type: 'context',
          author: 'chat-engine',
          tags: ['pipeline', 'execution-mode'],
        });
      }

      // --- Checkpoint state ---
      const existingCheckpoint = (context.conversation as any).__architectCheckpoint as ArchitectCheckpoint | undefined;
      const attempt = existingCheckpoint ? existingCheckpoint.attempt + 1 : 1;
      const started_at = existingCheckpoint?.started_at || new Date().toISOString();
      const initialMessages = existingCheckpoint?.messages;

      // Mark architect as running (awaited to guarantee state before execution starts)
      await this.updateConversation(conversationId, {
        architect_phase_status: 'running',
        architect_checkpoint: {
          messages: initialMessages || [],
          started_at,
          updated_at: new Date().toISOString(),
          steps_completed: existingCheckpoint?.steps_completed || 0,
          team_id: teamId,
          attempt,
        },
      } as any).catch(err => console.error('[ChatEngine] Status update failed:', err));

      // Debounced checkpoint callback — writes to DB every 3 steps or 30s.
      // Uses a serial queue to guarantee checkpoint write ordering.
      let lastCheckpointStep = existingCheckpoint?.steps_completed || 0;
      let lastCheckpointTime = Date.now();
      let checkpointQueue: Promise<void> = Promise.resolve();
      const onCheckpoint = (data: { messages: any[]; stepsCompleted: number }) => {
        if (data.stepsCompleted - lastCheckpointStep >= 3 || Date.now() - lastCheckpointTime >= 30_000) {
          lastCheckpointStep = data.stepsCompleted;
          lastCheckpointTime = Date.now();
          // Chain writes serially to prevent out-of-order DB updates
          checkpointQueue = checkpointQueue.then(() =>
            this.updateConversation(conversationId, {
              architect_checkpoint: {
                messages: data.messages,
                started_at,
                updated_at: new Date().toISOString(),
                steps_completed: data.stepsCompleted,
                team_id: teamId,
                attempt,
              },
            } as any).catch(err => console.error('[ChatEngine] Checkpoint write failed:', err))
          );
        }
      };

      // Start architect as background promise (non-blocking)
      const architectPromise = runArchitectPhase(context.userMessage, dmDecision, {
        projectId: context.conversation.project_id ?? undefined,
        structuredRequirements: context.conversation.structured_requirements ?? undefined,
        onApprovalRequired,
        blackboard,
        initialMessages,
        onCheckpoint,
        logger: async (msg: string) => {
          const friendly = this.transformAgentLog(msg);
          channel.push({
            type: 'agent_log',
            data: { message: friendly || msg },
          });
        },
      });

      // When architect finishes (success or error), close the channel
      architectPromise
        .then(async (result) => {
          emitWebhookEvent({
            event: 'architect_complete',
            title: 'Architect Phase Complete',
            detail: `Steps: ${result.steps_completed} completed, ${result.steps_failed} failed`,
            from: 'architect',
          });

          const responseText = `Architect complete. ${result.steps_completed} steps completed, ${result.steps_failed} failed.`;
          await this.saveMessage(conversationId, 'assistant', responseText).catch((err) => console.error('[ChatEngine] Save architect completion message failed:', err));

          // Drain pending checkpoint writes before marking complete
          await checkpointQueue;

          // Mark completed, store result, clear checkpoint
          await this.updateConversation(conversationId, {
            architect_phase_status: 'completed',
            architect_result: result,
            architect_checkpoint: null,
          } as any).catch(err => console.error('[ChatEngine] Architect completion update failed:', err));

          // Mark architect agent as completed
          teamCoordinator.updateAgentStatus(teamId, 'architect', 'completed').catch(() => {});

          // Medium mode: notify frontend about dynamic agents created during pipeline
          if (execMode === 'medium' && result.created_agents && result.created_agents.length > 0) {
            channel.push({
              type: 'agent_log',
              data: {
                message: `Dynamic agents created: ${result.created_agents.join(', ')}. You can manage them in Settings → Agents.`,
                dynamic_agents_created: result.created_agents,
                project_id: projectId,
              },
            });
          }

          channel.push({
            type: 'message',
            data: { role: 'assistant', content: responseText },
          });
          unsubLog();
          channel.close();
        })
        .catch(async (error: unknown) => {
          const errorMsg = `Architect execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

          emitWebhookEvent({
            event: 'architect_failed',
            title: 'Architect Phase Failed',
            detail: errorMsg,
            from: 'architect',
          });

          await this.saveMessage(conversationId, 'assistant', errorMsg).catch((err) => console.error('[ChatEngine] Save architect error message failed:', err));

          // Drain pending checkpoint writes before marking failed
          await checkpointQueue;

          // Mark failed, keep checkpoint for resume
          await this.updateConversation(conversationId, {
            architect_phase_status: 'failed',
          } as any).catch(err => console.error('[ChatEngine] Architect failure update failed:', err));

          // Mark architect agent as failed
          teamCoordinator.updateAgentStatus(teamId, 'architect', 'failed').catch(() => {});

          channel.push({
            type: 'architect_failed',
            data: {
              message: errorMsg,
              steps_completed: lastCheckpointStep,
              attempt,
            },
          });
          channel.push({
            type: 'error',
            data: { message: errorMsg },
          });
          unsubLog();
          channel.close();
        });

      // Consume events from channel and yield them as SSE
      for await (const event of channel) {
        yield event;
      }

      // Wait for architect promise to settle (should already be done)
      await architectPromise.catch(() => { /* already handled above */ });

      // Update team status to idle via coordinator
      if (supabaseConfigured) {
        await supabase
          .from('agent_teams')
          .update({ status: 'idle' })
          .eq('id', teamId);
      }
      // Fetch and emit real agent statuses
      try {
        const teamStatus = await teamCoordinator.getTeamStatus(teamId);
        // no-op: status already yielded through channel events
      } catch { /* team may already be disbanded */ }
    } catch (error: any) {
      channel.close();
      const errorMsg = `Architect execution failed: ${error.message}`;
      await this.saveMessage(context.conversation.id, 'assistant', errorMsg);
      yield { type: 'error', data: { message: errorMsg } };
    }
  }

  /**
   * Execute DM approval — called when user approves in DMDecisionPanel.
   * Validates state, updates approval status, then runs Architect phase.
   */
  async *executeDmApproval(conversationId: string): AsyncGenerator<ChatEvent> {
    const conversation = await this.getOrCreateConversation(conversationId);

    // Validate: must have a PROCEED decision with pending approval
    const dmDecision = conversation.dm_decision as DecisionOutput | null | undefined;
    if (!dmDecision || dmDecision.decision !== 'PROCEED') {
      yield { type: 'error', data: { message: 'No PROCEED decision found for this conversation.' } };
      yield { type: 'done', data: { conversation_id: conversationId } };
      return;
    }
    if (conversation.dm_approval_status !== 'pending') {
      yield { type: 'error', data: { message: `DM approval is not pending (current: ${conversation.dm_approval_status}).` } };
      yield { type: 'done', data: { conversation_id: conversationId } };
      return;
    }

    // Mark as approved
    await this.updateConversation(conversationId, {
      dm_approval_status: 'approved',
    } as any);

    // Build context for architect phase
    const messages = await this.getMessages(conversationId);
    const assessment = conversation.complexity_assessment;
    const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

    const context: ChatContext = {
      conversation: { ...conversation, dm_approval_status: 'approved' },
      messages,
      userMessage,
      assessment,
    };

    yield* this.handleArchitectPhase(context);

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  /**
   * Resume a failed/timed-out Architect phase from its last checkpoint.
   * Validates state, increments attempt, then delegates to handleArchitectPhase.
   */
  async *resumeArchitectPhase(conversationId: string): AsyncGenerator<ChatEvent> {
    const conversation = await this.getOrCreateConversation(conversationId);

    // Validate: must be in failed or timed_out state
    const status = (conversation as any).architect_phase_status;
    if (status !== 'failed' && status !== 'timed_out') {
      yield { type: 'error', data: { message: `Cannot resume: architect phase status is "${status || 'null'}", expected "failed" or "timed_out".` } };
      yield { type: 'done', data: { conversation_id: conversationId } };
      return;
    }

    // Validate: checkpoint must exist with messages
    const checkpoint = (conversation as any).architect_checkpoint as ArchitectCheckpoint | null;
    if (!checkpoint || !checkpoint.messages || checkpoint.messages.length === 0) {
      yield { type: 'error', data: { message: 'No checkpoint data available for resume. Please start over.' } };
      yield { type: 'done', data: { conversation_id: conversationId } };
      return;
    }

    // Limit retries to 3 attempts
    if (checkpoint.attempt >= 3) {
      yield { type: 'error', data: { message: `Maximum retry attempts (3) reached. Please start over from Decision Maker.` } };
      yield { type: 'done', data: { conversation_id: conversationId } };
      return;
    }

    yield {
      type: 'architect_resuming',
      data: {
        attempt: checkpoint.attempt + 1,
        steps_completed: checkpoint.steps_completed,
      },
    };

    // Build context and delegate to handleArchitectPhase
    const messages = await this.getMessages(conversationId);
    const assessment = conversation.complexity_assessment;
    const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

    const context: ChatContext = {
      conversation: {
        ...conversation,
        // Pass checkpoint data via internal property for handleArchitectPhase to detect
        __architectCheckpoint: checkpoint,
      } as any,
      messages,
      userMessage,
      assessment,
    };

    yield* this.handleArchitectPhase(context);

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  // ---------------------------------------------------------------------------
  // Agent loading helper
  // ---------------------------------------------------------------------------

  /**
   * Attempt to load an agent factory by name.
   */
  private async loadAgentFactory(agentName: string): Promise<(() => BaseAgent) | null> {
    const moduleMap: Record<string, () => Promise<any>> = {
      'architect': () => import('@/agents/architect'),
      'decision-maker': () => import('@/agents/decision-maker'),
      'developer': () => import('@/agents/developer'),
      'deployer': () => import('@/agents/deployer'),
      'planner': () => import('@/agents/planner'),
      'analyst': () => import('@/agents/analyst'),
      'reviewer': () => import('@/agents/reviewer'),
      'chat-judge': () => import('@/agents/chat-judge'),
      'chat-assistant': () => import('@/agents/chat-assistant'),
    };

    const loader = moduleMap[agentName];
    if (loader) {
      try {
        const mod = await loader();
        const createFn = Object.values(mod).find(
          (v): v is (...args: any[]) => BaseAgent => typeof v === 'function' && v.name?.startsWith('create')
        );
        if (createFn) return () => createFn();
      } catch {
        // Fall through
      }
    }

    if (hasAgentFactory(agentName)) {
      return null;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Database helpers
  // ---------------------------------------------------------------------------

  async getOrCreateConversation(id?: string): Promise<Conversation> {
    if (id && supabaseConfigured) {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (data) return data as Conversation;
    }

    // Create new conversation (preserve frontend-provided ID if available)
    if (supabaseConfigured) {
      const insertPayload: Record<string, any> = { status: 'active' };
      if (id) insertPayload.id = id;
      const { data, error } = await supabase
        .from('conversations')
        .insert(insertPayload)
        .select()
        .single();

      if (data) return data as Conversation;
      console.error('[ChatEngine] Failed to create conversation:', error);
    }

    // Fallback for non-DB mode
    return {
      id: id || crypto.randomUUID(),
      title: null,
      status: 'active',
      project_id: null,
      complexity_assessment: null,
      execution_mode: null,
      clarification_round: 0,
      clarification_context: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async saveMessage(
    conversationId: string,
    role: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!supabaseConfigured) return;

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata || null,
    });
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!supabaseConfigured) return [];

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    return (data || []) as ChatMessage[];
  }

  async updateConversation(
    id: string,
    updates: Partial<Conversation>,
  ): Promise<void> {
    if (!supabaseConfigured) return;

    await supabase
      .from('conversations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  // createTeam removed — use teamCoordinator.formTeam() instead
}

/** Singleton instance. */
export const chatEngine = new ChatEngine();
