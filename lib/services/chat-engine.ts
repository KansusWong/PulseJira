/**
 * Chat Engine — core orchestration layer for the Chat-First architecture.
 *
 * RebuilD Architecture:
 * 1. Receive user message
 * 2. Route ALL messages through handleUnified() → RebuilD Agent
 * 3. RebuilD self-determines complexity and strategy
 * 4. Stream responses back via async generators
 *
 * Legacy L1/L2/L3 routing has been removed. The RebuilD agent handles all tasks
 * with its built-in complexity judgment and tool set (plan_mode, todo, task, etc.).
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { generateJSON } from '@/lib/core/llm';
import { getPreferences } from '@/lib/services/preferences-store';
import { messageBus } from '@/connectors/bus/message-bus';
import { createProject, getProject, updateProject } from '@/projects/project-service';
import { EventChannel } from '@/lib/utils/event-channel';
import { toolApprovalService } from '@/lib/services/tool-approval';
import { compactionUpgradeService } from '@/lib/services/compaction-upgrade';
import { recordToolApprovalEvent } from '@/lib/services/tool-approval-audit';
import { workspaceManager } from '@/lib/sandbox/workspace-manager';
import type { Workspace } from '@/lib/sandbox/types';
import { getEnvironmentContext } from '@/lib/utils/environment';
import { createRebuilDAgent, BLOCKED_SUBORDINATE_TOOLS } from '@/agents/rebuild';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { loadSoul } from '@/agents/utils';
import { CreateWorkspaceTool } from '@/lib/tools/create-workspace';
import type {
  Conversation,
  ChatMessage,
  ComplexityAssessment,
  ChatEvent,
  StructuredAgentStep,
} from '@/lib/core/types';

// ---------------------------------------------------------------------------
// Agent instance cache — reuse per conversation (TTL 5 min, max 20 entries)
// ---------------------------------------------------------------------------

interface CachedAgent {
  agent: ReturnType<typeof createRebuilDAgent>;
  workspace?: string;
  createdAt: number;
}

const agentCache = new Map<string, CachedAgent>();
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const AGENT_CACHE_MAX = 20;

function getCachedAgent(conversationId: string, workspace?: string): CachedAgent | null {
  const entry = agentCache.get(conversationId);
  if (!entry) return null;

  // TTL check
  if (Date.now() - entry.createdAt > AGENT_CACHE_TTL_MS) {
    agentCache.delete(conversationId);
    return null;
  }

  // Workspace mismatch invalidation (e.g., project associated mid-conversation)
  if (entry.workspace !== workspace) {
    agentCache.delete(conversationId);
    return null;
  }

  return entry;
}

function setCachedAgent(conversationId: string, agent: ReturnType<typeof createRebuilDAgent>, workspace?: string): void {
  // LRU eviction when at capacity
  if (agentCache.size >= AGENT_CACHE_MAX && !agentCache.has(conversationId)) {
    // Evict oldest entry
    const oldestKey = agentCache.keys().next().value;
    if (oldestKey) agentCache.delete(oldestKey);
  }
  agentCache.set(conversationId, { agent, workspace, createdAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Chat context
// ---------------------------------------------------------------------------

interface ChatContext {
  conversation: Conversation;
  messages: ChatMessage[];
  userMessage: string;
  assessment: ComplexityAssessment | null;
}

// ---------------------------------------------------------------------------
// Structured Marker Protocol
// ---------------------------------------------------------------------------

interface StructuredMarker {
  type: 'plan_mode_enter' | 'plan_review' | 'question_data' | 'team_upgrade';
  data: any;
}

/**
 * Parse structured markers from agent text output.
 * Markers follow the pattern: [[MARKER_TYPE]]{json}[[/MARKER_TYPE]]
 */
function parseStructuredMarkers(text: string): StructuredMarker[] {
  const markers: StructuredMarker[] = [];
  const patterns: Array<{ regex: RegExp; type: StructuredMarker['type'] }> = [
    { regex: /\[\[PLAN_MODE_ENTER\]\]([\s\S]*?)\[\[\/PLAN_MODE_ENTER\]\]/g, type: 'plan_mode_enter' },
    { regex: /\[\[PLAN_REVIEW\]\]([\s\S]*?)\[\[\/PLAN_REVIEW\]\]/g, type: 'plan_review' },
    { regex: /\[\[QUESTION_DATA\]\]([\s\S]*?)\[\[\/QUESTION_DATA\]\]/g, type: 'question_data' },
    { regex: /\[\[TEAM_UPGRADE\]\]([\s\S]*?)\[\[\/TEAM_UPGRADE\]\]/g, type: 'team_upgrade' },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        markers.push({ type, data });
      } catch {
        // Invalid JSON in marker — skip
      }
    }
  }

  return markers;
}

/**
 * Strip structural markers from text for clean display.
 */
function stripMarkers(text: string): string {
  return text
    .replace(/\[\[PLAN_MODE_ENTER\]\][\s\S]*?\[\[\/PLAN_MODE_ENTER\]\]/g, '')
    .replace(/\[\[PLAN_REVIEW\]\][\s\S]*?\[\[\/PLAN_REVIEW\]\]/g, '')
    .replace(/\[\[QUESTION_DATA\]\][\s\S]*?\[\[\/QUESTION_DATA\]\]/g, '')
    .replace(/\[\[TEAM_UPGRADE\]\][\s\S]*?\[\[\/TEAM_UPGRADE\]\]/g, '')
    .replace(/\[\[WAITING_FOR_INPUT\]\]/g, '')
    .replace(/\[\[TOOL_ERROR\]\][\s\S]*?\[\[\/TOOL_ERROR\]\]/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Project name generation
// ---------------------------------------------------------------------------

async function generateProjectName(
  userMessage: string,
  opts?: { isLight?: boolean; assessment?: ComplexityAssessment | null },
): Promise<string> {
  const fallback = userMessage
    .slice(0, 50)
    .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
    .trim() || (opts?.isLight ? 'Light Task' : 'New Project');

  try {
    const result = await generateJSON(
      `You are a project-naming assistant. Given a user request, generate a short project name (max 30 chars) that captures the user's intent.

Rules:
- Use a TYPE prefix: POC-Demo, Feature, Refactor, Bugfix, Tool, Integration, Analysis, Design, etc.
- Follow with concise description in user's language
- Keep short and scannable
- No quotes or special characters

Respond with JSON: { "name": "..." }`,
      userMessage.slice(0, 300),
      { agentName: 'project-namer' },
    );
    const name = result?.name;
    if (typeof name === 'string' && name.trim().length > 0) {
      return name.trim().slice(0, 60);
    }
    return fallback;
  } catch {
    return fallback;
  }
}


// ---------------------------------------------------------------------------
// ChatEngine
// ---------------------------------------------------------------------------

export class ChatEngine {
  static getEnvironmentContext(): string {
    return getEnvironmentContext();
  }

  /**
   * Extract a clean text response from agent result.
   */
  static extractResponse(result: any): string {
    if (typeof result === 'string') return result;
    if (result?.content && typeof result.content === 'string') return result.content;
    if (result?.response && typeof result.response === 'string') return result.response;

    if (result?.__incomplete && Array.isArray(result.__messages)) {
      for (let i = result.__messages.length - 1; i >= 0; i--) {
        const msg = result.__messages[i];
        if (msg.role === 'assistant' && msg.content && typeof msg.content === 'string') {
          return msg.content;
        }
      }
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

  // =========================================================================
  // Main entry point — ALL messages route through handleUnified
  // =========================================================================

  /**
   * Main entry point: handle a user message and yield SSE events.
   * Routes ALL messages through RebuilD agent via handleUnified().
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

    // 4. Update title if not set
    if (!conversation.title) {
      await this.updateConversation(conversation.id, {
        title: message.slice(0, 80),
      } as any);
    }

    // 5. Route through unified handler — no complexity assessment needed
    const context: ChatContext = {
      conversation,
      messages: history,
      userMessage: message,
      assessment: null,
    };

    yield* this.handleUnified(context);

    yield { type: 'done', data: { conversation_id: conversation.id } };
  }

  // =========================================================================
  // handleUnified — RebuilD agent handles everything
  // =========================================================================

  /**
   * Unified handler — creates RebuilD agent, runs it, parses structured markers.
   * Replaces handleDirect, handleSingleAgentWithProject, handleAgentTeam.
   */
  private async *handleUnified(context: ChatContext): AsyncGenerator<ChatEvent> {
    const channel = new EventChannel<ChatEvent>();
    const conversationId = context.conversation.id;

    try {
      // --- 1. Reuse existing Project + Workspace (only when already exists) ---
      let projectId = context.conversation.project_id;
      let workspace: Workspace | undefined;

      if (projectId) {
        try {
          const project = await getProject(projectId);
          const dirName = project?.name?.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '-')
            || `project-${conversationId.slice(0, 8)}`;
          workspace = await workspaceManager.createLocal({
            projectId,
            localDir: dirName,
          });
        } catch (err: any) {
          console.error('[ChatEngine] Workspace load failed:', err.message);
        }
      }
      // No projectId → no project/workspace creation → lightweight agent

      // --- 2. Build RebuilD agent ---

      // Read trust level for approval gate
      let trustLevel: 'auto' | 'standard' | 'collaborative' = 'standard';
      try {
        const prefs = await getPreferences();
        trustLevel = prefs.trustLevel || 'standard';
      } catch { /* default standard */ }

      // Tool approval callback — provided for standard & collaborative modes.
      // In auto mode, set to undefined so all approvals are skipped.
      // The actual per-tool decision (based on riskLevel) is handled in base-agent.ts.
      const onApprovalRequired = trustLevel === 'auto' ? undefined : async (params: {
        toolName: string;
        toolArgs: Record<string, any>;
        agentName: string;
      }): Promise<boolean> => {
        const approvalId = crypto.randomUUID();
        await this.updateConversation(conversationId, {
          pending_tool_approval: {
            approval_id: approvalId,
            tool_name: params.toolName,
            tool_args: params.toolArgs,
            agent_name: params.agentName,
            requested_at: new Date().toISOString(),
          },
        } as any);

        recordToolApprovalEvent({
          approvalId,
          conversationId,
          agentName: params.agentName,
          toolName: params.toolName,
          toolArgs: params.toolArgs,
          status: 'requested',
        }).catch(() => {});

        channel.push({
          type: 'tool_approval_required',
          data: {
            approval_id: approvalId,
            tool_name: params.toolName,
            tool_args: params.toolArgs,
            agent_name: params.agentName,
          },
        });

        const { promise } = toolApprovalService.requestApproval({
          approvalId,
          toolName: params.toolName,
          agentName: params.agentName,
          conversationId,
        });

        const approved = await promise;

        await this.updateConversation(conversationId, {
          pending_tool_approval: null,
        } as any);

        channel.push({
          type: 'tool_approval_resolved',
          data: { approval_id: approvalId, approved },
        });

        return approved;
      };

      // Compaction → Team upgrade callback.
      // When the agent's context hits 75%, offer the user a choice to upgrade to Team mode.
      const onCompactionUpgradeRequired = async (params: {
        tokenUsage: { estimated: number; max: number; ratio: number };
      }): Promise<boolean> => {
        const upgradeId = crypto.randomUUID();

        channel.push({
          type: 'compaction_upgrade_required',
          data: {
            upgrade_id: upgradeId,
            token_usage: params.tokenUsage,
          },
        });

        const { promise } = compactionUpgradeService.requestUpgrade({
          upgradeId,
          conversationId,
        });

        const approved = await promise;

        channel.push({
          type: 'compaction_upgrade_resolved',
          data: { upgrade_id: upgradeId, approved },
        });

        return approved;
      };

      const configOverride = loadAgentConfig('rebuild');
      const soulContent = configOverride.soul ?? loadSoul('rebuild');

      // Shared reference — create_workspace tool writes into this
      const workspaceRef: { path?: string; projectId?: string } = {};

      const onProjectCreated = (pid: string, name: string) => {
        // Update conversation with new project_id
        this.updateConversation(conversationId, { project_id: pid } as any);
        channel.push({ type: 'project_created', data: { project_id: pid, name, is_light: false } });
      };

      // If no workspace exists, provide the create_workspace tool so the agent
      // can decide whether to create one. Already-existing workspaces skip this.
      const extraTools = workspace ? [] : [
        new CreateWorkspaceTool(conversationId, workspaceRef, onProjectCreated),
      ];

      // Reuse cached agent for the same conversation + workspace, or create new
      const cachedEntry = getCachedAgent(conversationId, workspace?.localPath);
      const agent = cachedEntry
        ? cachedEntry.agent
        : createRebuilDAgent({
            workspace: workspace?.localPath,
            maxLoops: configOverride.maxLoops ?? 30,
            model: configOverride.model,
            systemPrompt: configOverride.systemPrompt,
            soulPrompt: soulContent || undefined,
            extraTools,
          });

      // Cache the agent for future messages in this conversation
      if (!cachedEntry) {
        setCachedAgent(conversationId, agent, workspace?.localPath);
      }

      // --- 4. Build input with conversation history ---
      const historyContext = context.messages
        .slice(-10)
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n\n');

      // Channel-based logger
      const channelLogger = async (msg: string) => {
        const step = this.transformAgentLog(msg);
        if (step) {
          channel.push({ type: 'agent_log', data: { message: step.message, step } });
        }
      };

      // Subscribe to sub-agent events
      const unsubscribe = messageBus.subscribe('meta-pipeline', (message) => {
        if (message.type === 'sub_agent_start') {
          const agentName = message.payload?.agent_name || message.to;
          channel.push({ type: 'sub_agent_start', data: { agent_name: agentName, task: message.payload?.task } });
          channel.push({ type: 'agent_log', data: { message: `子智能体「${agentName}」启动中...` } });
        } else if (message.type === 'sub_agent_complete') {
          const agentName = message.payload?.agent_name || message.from;
          const status = message.payload?.status === 'success' ? '已完成' : '执行失败';
          channel.push({ type: 'sub_agent_complete', data: { agent_name: agentName, status: message.payload?.status, duration_ms: message.payload?.duration_ms } });
          channel.push({ type: 'agent_log', data: { message: `子智能体「${agentName}」${status}` } });
        }
      });

      // --- 5. Streaming callbacks → EventChannel → SSE ---
      const onToken = (token: string) => {
        channel.push({ type: 'token', data: { content: token } });
      };
      const onReasoningToken = (token: string) => {
        channel.push({ type: 'reasoning_token', data: { content: token } });
      };
      const onToolCallStart = (params: { toolName: string; toolCallId: string; args: string }) => {
        const toolLabel = ChatEngine.TOOL_LABELS[params.toolName] || params.toolName;
        channel.push({ type: 'tool_call_start', data: { ...params, toolLabel } });
      };
      const onToolCallEnd = (params: { toolName: string; toolCallId: string; result: string; success: boolean }) => {
        const toolLabel = ChatEngine.TOOL_LABELS[params.toolName] || params.toolName;
        channel.push({ type: 'tool_call_end', data: { ...params, toolLabel } });
      };
      const onStepStart = (stepNumber: number) => {
        channel.push({ type: 'step_start', data: { step: stepNumber } });
      };

      // --- 6. Run agent in background (streaming mode) ---
      const agentPromise = agent.runStreaming(
        `${historyContext}\n\n[user]: ${context.userMessage}`,
        {
          projectId: projectId || undefined,
          logger: channelLogger,
          trustLevel,
          onApprovalRequired,
          onCompactionUpgradeRequired,
          onToken,
          onReasoningToken,
          onToolCallStart,
          onToolCallEnd,
          onStepStart,
          workspacePath: workspace?.localPath,
        },
      );

      agentPromise
        .then(async (result) => {
          const responseText = ChatEngine.extractResponse(result);

          // Parse structured markers from response
          const markers = parseStructuredMarkers(responseText);
          for (const marker of markers) {
            if (marker.type === 'plan_review') {
              channel.push({ type: 'plan_review' as any, data: marker.data });
            } else if (marker.type === 'question_data') {
              channel.push({ type: 'questionnaire', data: marker.data });
            } else if (marker.type === 'plan_mode_enter') {
              channel.push({ type: 'plan_mode_enter' as any, data: marker.data });
            } else if (marker.type === 'team_upgrade') {
              channel.push({ type: 'team_upgrade', data: marker.data });
            }
          }

          // Clean response (strip markers for display)
          const cleanResponse = stripMarkers(responseText);

          // --- Phase 2: If lightweight agent created a workspace, upgrade to full agent ---
          if (workspaceRef.path && !workspace) {
            projectId = workspaceRef.projectId!;

            // Send phase 1 response if any (before phase 2 starts)
            if (cleanResponse) {
              channel.push({ type: 'message', data: { role: 'assistant', content: cleanResponse, metadata: null } });
            }

            const fullAgent = createRebuilDAgent({
              workspace: workspaceRef.path,
              maxLoops: configOverride.maxLoops ?? 30,
              model: configOverride.model,
              systemPrompt: configOverride.systemPrompt,
              soulPrompt: soulContent || undefined,
            });

            // Continue execution with workspace tools available
            const phase2Result = await fullAgent.run(
              `工作空间已创建（${workspaceRef.path}），现在可以使用文件操作工具。请继续执行用户的原始任务。\n\n原始请求：${context.userMessage}`,
              {
                projectId,
                logger: channelLogger,
                trustLevel,
                onApprovalRequired,
                workspacePath: workspaceRef.path,
              },
            );

            const phase2Text = ChatEngine.extractResponse(phase2Result);
            const cleanPhase2 = stripMarkers(phase2Text);

            if (cleanPhase2) {
              const isExportable = /```[\s\S]*?```/.test(cleanPhase2) || cleanPhase2.length > 800;
              const metadata = isExportable ? { exportable: true } : undefined;
              await this.saveMessage(conversationId, 'assistant', cleanPhase2, metadata).catch((err) =>
                console.error('[ChatEngine] Save phase2 response failed:', err));
              channel.push({ type: 'message', data: { role: 'assistant', content: cleanPhase2, metadata: metadata ?? null } });
            }
          } else {
            // No phase 2 — process result directly
            if (cleanResponse) {
              const isExportable = /```[\s\S]*?```/.test(cleanResponse) || cleanResponse.length > 800;
              const metadata = isExportable ? { exportable: true } : undefined;
              await this.saveMessage(conversationId, 'assistant', cleanResponse, metadata).catch((err) =>
                console.error('[ChatEngine] Save response failed:', err));
              channel.push({ type: 'message', data: { role: 'assistant', content: cleanResponse, metadata: metadata ?? null } });
            }
          }

          // Update project status (only if project exists)
          if (projectId) {
            updateProject(projectId, { status: 'active' }).catch((err) =>
              console.error('[ChatEngine] Set project active failed:', err));
          }

          channel.close();
          unsubscribe();
        })
        .catch(async (error: unknown) => {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          channel.push({ type: 'error', data: { message: errorMsg } });
          channel.close();
          unsubscribe();
        });

      // Consume events from channel
      for await (const event of channel) {
        yield event;
      }

      await agentPromise.catch(() => {});
    } catch (error: any) {
      channel.close();
      yield { type: 'error', data: { message: error.message } };
    }
  }

  // =========================================================================
  // Tool label mapping (expanded for new tools)
  // =========================================================================

  /** Tool name → Chinese label mapping. */
  private static readonly TOOL_LABELS: Record<string, string> = {
    // New primary names
    read: '读取文件',
    write: '写入文件',
    edit: '编辑文件',
    multi_edit: '批量编辑',
    ls: '浏览目录',
    bash: '执行命令',
    glob: '搜索文件',
    grep: '搜索内容',
    task: '委派子任务',
    enter_plan_mode: '进入计划模式',
    exit_plan_mode: '提交计划',
    ask_user_question: '向用户提问',
    todo_write: '更新任务清单',
    todo_read: '查看任务清单',
    // Old names (compat)
    web_search: '搜索',
    read_file: '读取文件',
    list_files: '浏览目录',
    code_write: '写入代码',
    code_edit: '编辑代码',
    run_command: '执行命令',
    spawn_agent: '分派子任务',
    list_agents: '查看可用智能体',
    // Domain tools
    git_commit: 'Git 提交',
    git_create_pr: '创建 PR',
    run_tests: '运行测试',
    validate_output: '验证输出',
    create_agent: '创建智能体',
    create_skill: '创建技能',
    // Knowledge tools
    semantic_search: '语义搜索',
    discover_skills: '发现技能',
    store_code_pattern: '存储代码模式',
    // New tools
    web_fetch: '获取网页内容',
    browse_url: '浏览网页',
    execute_code: '执行代码',
    execute_python: '执行Python',
    python_repl: 'Python表达式',
    check_executor: '检查执行器',
    reset_python_env: '重置Python环境',
    show_python_vars: '查看Python变量',
    browser: '浏览器操作',
    analyze_image: '分析图片',
    generate_image: '生成图片',
    edit_image: '编辑图片',
    generate_video: '生成视频',
    automation: '自动化流水线',
    screenshot: '截图',
    mouse_click: '鼠标点击',
    keyboard_type: '键盘输入',
    keyboard_hotkey: '快捷键',
    mouse_move: '鼠标移动',
    read_document: '读取文档',
    // Workspace
    create_workspace: '创建工作空间',
    // Misc
    fetch_daily_data: '获取日报数据',
    finish_planning: '完成规划',
    finish_implementation: '完成实现',
    finish_daily_report: '生成日报',
    report_plan_progress: '报告进度',
    blackboard_read: '读取黑板',
    blackboard_write: '写入黑板',
    merge_pr: '合并 PR',
    check_ci: '检查 CI',
    trigger_deploy: '触发部署',
    check_health: '健康检查',
  };

  /**
   * Transform internal BaseAgent log messages into StructuredAgentStep.
   */
  private transformAgentLog(message: string): StructuredAgentStep | null {
    const agentMatch = message.match(/\[([\w-]+)\]/);
    const agent = agentMatch ? agentMatch[1] : 'system';

    // "[agent] Step N: Thinking..."
    const stepMatch = message.match(/\[[\w-]+\] Step (\d+): Thinking/);
    if (stepMatch) {
      return {
        id: crypto.randomUUID(),
        agent,
        kind: 'thinking',
        stepNumber: parseInt(stepMatch[1], 10),
        message: '思考中...',
        timestamp: Date.now(),
      };
    }

    // "[agent] Text: <content>"
    const textMatch = message.match(/\[[\w-]+\] Text: ([\s\S]+)$/);
    if (textMatch) {
      const text = textMatch[1].trim();
      if (!text) return null;
      return {
        id: crypto.randomUUID(),
        agent,
        kind: 'text',
        message: text.slice(0, 200),
        timestamp: Date.now(),
      };
    }

    // "[agent] Action: toolName({...args})"
    const actionMatch = message.match(/\[[\w-]+\] Action: (\w+)\(([\s\S]*)\)\s*$/);
    if (actionMatch) {
      const toolName = actionMatch[1];
      const rawArgs = actionMatch[2];

      let argSummary = '';
      try {
        const parsed = JSON.parse(rawArgs);
        if (parsed.query) argSummary = parsed.query;
        else if (parsed.path) argSummary = parsed.path;
        else if (parsed.command) argSummary = parsed.command;
        else if (parsed.pattern) argSummary = parsed.pattern;
        else if (parsed.description) argSummary = parsed.description;
        else if (parsed.agent_name) argSummary = parsed.agent_name;
        else if (parsed.name) argSummary = parsed.name;
        else if (parsed.title) argSummary = parsed.title;
        else if (parsed.dir) argSummary = parsed.dir;
      } catch {
        // args not valid JSON
      }

      const toolLabel = ChatEngine.TOOL_LABELS[toolName] || toolName;
      const displayMsg = argSummary ? `${toolLabel}(${argSummary})` : toolLabel;

      return {
        id: crypto.randomUUID(),
        agent,
        kind: 'tool_call',
        toolName,
        toolLabel,
        argSummary: argSummary || undefined,
        message: displayMsg,
        timestamp: Date.now(),
      };
    }

    // "[agent] Result: toolName | OK/ERROR | preview"
    const resultMatch = message.match(/\[[\w-]+\] Result: (\w+) \| (OK|ERROR) \| ([\s\S]*)$/);
    if (resultMatch) {
      const toolName = resultMatch[1];
      const success = resultMatch[2] === 'OK';
      const resultPreview = resultMatch[3].trim();
      const toolLabel = ChatEngine.TOOL_LABELS[toolName] || toolName;

      return {
        id: crypto.randomUUID(),
        agent,
        kind: 'tool_result',
        toolName,
        toolLabel,
        success,
        resultPreview: resultPreview.slice(0, 150),
        message: success ? '完成' : `失败: ${resultPreview.slice(0, 80)}`,
        timestamp: Date.now(),
      };
    }

    // Completion messages
    if (message.includes('Completed with text response')) {
      return { id: crypto.randomUUID(), agent, kind: 'completion', message: '正在整理结果...', timestamp: Date.now() };
    }
    if (message.includes('Max loops')) {
      return { id: crypto.randomUUID(), agent, kind: 'completion', message: '已达到最大步数，正在收尾...', timestamp: Date.now() };
    }
    if (message.includes('Exit tool')) {
      return { id: crypto.randomUUID(), agent, kind: 'completion', message: '任务即将完成...', timestamp: Date.now() };
    }

    return null;
  }


  // =========================================================================
  // Team initialization (second SSE stream after compaction upgrade)
  // =========================================================================

  /**
   * Handle team initialization after compaction upgrade approval.
   * Called by the frontend auto-bridge mechanism.
   * Creates a team from the state summary, spawns teammate agents,
   * and streams their execution progress.
   */
  async *handleTeamInit(
    conversationId: string,
    stateSummary: string,
  ): AsyncGenerator<ChatEvent> {
    const channel = new EventChannel<ChatEvent>();

    try {
      // 1. Ensure conversation exists
      const conversation = await this.getOrCreateConversation(conversationId);
      let projectId = conversation.project_id;

      // 2. Create project if none exists
      if (!projectId) {
        const projectName = await generateProjectName(stateSummary, { isLight: false });
        const project = await createProject({
          name: projectName,
          description: `Team upgrade from conversation ${conversationId}`,
        });
        await updateProject(project.id, { status: 'active' });
        projectId = project.id;
        await this.updateConversation(conversationId, { project_id: projectId } as any);
        channel.push({ type: 'project_created', data: { project_id: projectId, name: projectName, is_light: false } });
      }

      // 3. Create team record
      const teamId = crypto.randomUUID();
      if (supabaseConfigured) {
        await supabase.from('agent_teams').insert({
          id: teamId,
          conversation_id: conversationId,
          project_id: projectId,
          team_name: 'Upgrade Team',
          lead_agent: 'rebuild',
          status: 'forming',
          config: { source: 'compaction_upgrade', state_summary: stateSummary.slice(0, 5000) },
        });
      }

      // 4. Extract teammate definitions from state summary
      const teammates = await this.extractTeammatesFromSummary(stateSummary);

      // 5. Create workspace
      const dirName = `team-${teamId.slice(0, 8)}`;
      let workspace: Workspace | undefined;
      try {
        workspace = await workspaceManager.createLocal({
          projectId: projectId!,
          localDir: dirName,
        });
      } catch (err: any) {
        console.error('[ChatEngine] Team workspace creation failed:', err.message);
      }

      // 6. Emit team roster
      channel.push({
        type: 'team_update',
        data: {
          team_id: teamId,
          agents: teammates.map(t => ({
            name: t.name,
            role: t.role,
            status: 'pending',
            task: t.task,
          })),
        },
      });

      // 7. Channel logger
      const channelLogger = async (msg: string) => {
        const step = this.transformAgentLog(msg);
        if (step) {
          channel.push({ type: 'agent_log', data: { message: step.message, step } });
        }
      };

      // 8. Launch teammate agents in parallel
      const agentPromises = teammates.map(async (teammate) => {
        const configOverride = loadAgentConfig('rebuild');
        const soulContent = configOverride.soul ?? loadSoul('rebuild');

        const teammateAgent = createRebuilDAgent({
          workspace: workspace?.localPath,
          maxLoops: 15,
          model: configOverride.model,
          excludeTools: BLOCKED_SUBORDINATE_TOOLS,
          systemPrompt: `You are ${teammate.name}, a specialized teammate in a software engineering team.

## Your Role
${teammate.role}

## Context (from lead agent's handoff)
${stateSummary}

## Your Specific Task
${teammate.task}

## Important
- You have your own independent context window
- Focus on your assigned task
- Report your results clearly`,
          soulPrompt: soulContent || undefined,
        });

        channel.push({
          type: 'sub_agent_start',
          data: { agent_name: teammate.name, task: teammate.task },
        });

        const startTime = Date.now();
        try {
          const result = await teammateAgent.run(teammate.task, {
            projectId: projectId!,
            logger: channelLogger,
            workspacePath: workspace?.localPath,
          });

          const durationMs = Date.now() - startTime;
          channel.push({
            type: 'sub_agent_complete',
            data: { agent_name: teammate.name, status: 'success', duration_ms: durationMs },
          });

          return { name: teammate.name, result: ChatEngine.extractResponse(result), success: true };
        } catch (err: any) {
          channel.push({
            type: 'sub_agent_complete',
            data: { agent_name: teammate.name, status: 'failed', error: err.message },
          });
          return { name: teammate.name, result: err.message, success: false };
        }
      });

      const results = await Promise.all(agentPromises);

      // 9. Synthesize final report
      const finalSummary = results.map(r =>
        `### ${r.name}\n**Status**: ${r.success ? '✅ Completed' : '❌ Failed'}\n\n${typeof r.result === 'string' ? r.result.slice(0, 1000) : JSON.stringify(r.result).slice(0, 1000)}`,
      ).join('\n\n---\n\n');

      const reportContent = `## Team Execution Complete\n\n${finalSummary}`;
      await this.saveMessage(conversationId, 'assistant', reportContent).catch((err) =>
        console.error('[ChatEngine] Save team report failed:', err));

      channel.push({
        type: 'message',
        data: { role: 'assistant', content: reportContent, metadata: { teamId } },
      });

      // 10. Update team status
      if (supabaseConfigured) {
        await supabase.from('agent_teams')
          .update({ status: 'idle' })
          .eq('id', teamId);
      }

      channel.close();
    } catch (error: any) {
      channel.push({ type: 'error', data: { message: error.message } });
      channel.close();
    }

    for await (const event of channel) {
      yield event;
    }

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  /**
   * Extract teammate definitions from a state summary using LLM.
   */
  private async extractTeammatesFromSummary(
    stateSummary: string,
  ): Promise<Array<{ name: string; role: string; task: string }>> {
    try {
      const result = await generateJSON(
        `You are analyzing a state summary from a software engineering session.
Extract the distinct work streams / subagent tasks mentioned.
For each, create a teammate definition.

Respond with JSON: { "teammates": [{ "name": "...", "role": "...", "task": "..." }] }

Rules:
- Names should be descriptive slugs (e.g., "frontend-dev", "api-designer")
- Role is a one-line description of their specialty
- Task is a self-contained description of what they need to do
- Maximum 5 teammates
- If no clear subagents are mentioned, create 2-3 based on the remaining work described`,
        stateSummary.slice(0, 5000),
        { agentName: 'team-planner' },
      );
      return result?.teammates || [];
    } catch {
      // Fallback: single general-purpose teammate
      return [{
        name: 'general-engineer',
        role: 'Full-stack software engineer',
        task: `Continue the work described in the state summary:\n${stateSummary.slice(0, 1000)}`,
      }];
    }
  }

  // =========================================================================
  // Database helpers
  // =========================================================================

  async getOrCreateConversation(id?: string): Promise<Conversation> {
    if (id && supabaseConfigured) {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (data) return data as Conversation;
    }

    if (supabaseConfigured) {
      const insertPayload: Record<string, any> = { status: 'active' };
      if (id) insertPayload.id = id;
      const { data, error } = await supabase
        .from('conversations')
        .upsert(insertPayload, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .single();

      if (data) return data as Conversation;

      if (id) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .single();
        if (existing) return existing as Conversation;
      }
      console.error('[ChatEngine] Failed to create conversation:', error);
    }

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
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { error } = await supabase
          .from('conversations')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (!error) return;
        console.error(`[ChatEngine] updateConversation attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      } catch (e: any) {
        console.error(`[ChatEngine] updateConversation attempt ${attempt}/${MAX_RETRIES} network error:`, e.message);
      }
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500 * attempt));
    }
    console.error('[ChatEngine] updateConversation failed after retries', { id, keys: Object.keys(updates) });
  }
}

/** Singleton instance. */
export const chatEngine = new ChatEngine();
