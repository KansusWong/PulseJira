/**
 * Chat Engine — core orchestration layer for the Chat-First architecture.
 *
 * Handles the full lifecycle:
 * 1. Receive user message
 * 2. Assess complexity (first message only, with re-assessment support)
 * 3. Route to appropriate executor based on execution mode
 * 4. Stream responses back via async generators
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { assessComplexity } from '@/agents/complexity-assessor';
import { messageBus } from '@/connectors/bus/message-bus';
import { getTools } from '@/lib/tools';
import { runMetaPipeline } from '@/skills/meta-pipeline';
import { hasAgentFactory, getAgentFactoryIds } from '@/lib/tools/spawn-agent';
import { BaseAgent } from '@/lib/core/base-agent';
import type {
  Conversation,
  ChatMessage,
  ComplexityAssessment,
  ExecutionMode,
  ChatEvent,
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

// ---------------------------------------------------------------------------
// ChatEngine
// ---------------------------------------------------------------------------

export class ChatEngine {
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

    // 4. Assess complexity (on first message, or re-assess if stale — B4 fix)
    let assessment = conversation.complexity_assessment;
    const assessedAtCount = (conversation as any).assessed_at_message_count ?? 0;
    const userMessageCount = history.filter(m => m.role === 'user').length;
    const shouldReassess = !assessment || (userMessageCount - assessedAtCount >= REASSESS_MESSAGE_THRESHOLD);

    if (shouldReassess) {
      yield { type: 'agent_log', data: { message: 'Assessing request complexity...' } };
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

        yield { type: 'plan_assessment', data: assessment };
      } catch {
        // Default to single_agent on assessment failure
        assessment = {
          complexity_level: 'simple',
          execution_mode: 'single_agent',
          rationale: 'Assessment failed, defaulting to single agent.',
          suggested_agents: [],
          estimated_steps: 1,
          plan_outline: [],
          requires_project: false,
        };
        yield { type: 'plan_assessment', data: assessment };
      }
    }

    // 5. Route to executor
    const context: ChatContext = {
      conversation,
      messages: history,
      userMessage: message,
      assessment,
    };

    const mode = assessment!.execution_mode;

    // For trivial/simple: execute directly
    // For moderate+: yield plan for approval (requires separate approval step)
    if (mode === 'single_agent') {
      yield* this.handleSingleAgent(context);
    } else {
      // For non-trivial modes, yield plan and wait for approval
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

    switch (mode) {
      case 'workflow':
        yield* this.handleWorkflow(context);
        break;
      case 'agent_team':
        yield* this.handleAgentTeam(context);
        break;
      case 'agent_swarm':
        yield* this.handleAgentSwarm(context);
        break;
      default:
        yield* this.handleSingleAgent(context);
    }

    yield { type: 'done', data: { conversation_id: conversationId } };
  }

  // ---------------------------------------------------------------------------
  // Execution mode handlers
  // ---------------------------------------------------------------------------

  /**
   * Single agent mode — lightweight chat with tool access.
   * Equipped with web_search, read_file, list_files for context-aware answers.
   */
  private async *handleSingleAgent(context: ChatContext): AsyncGenerator<ChatEvent> {
    yield { type: 'agent_log', data: { message: 'Processing with single agent...' } };

    try {
      const systemPrompt = `You are RebuilD Assistant, an AI project management helper.
Answer the user's question or help with their request directly.
Be concise, professional, and helpful. Use Markdown formatting.
If the request involves code, provide clear code examples.
If the request involves project planning, provide structured plans.
You have access to tools for searching the web, reading files, and listing directories.`;

      const tools = getTools('web_search', 'read_file', 'list_files');

      const agent = new BaseAgent({
        name: 'chat-assistant',
        systemPrompt,
        tools,
        maxLoops: 5,
        model: process.env.LLM_MODEL_NAME ?? 'gpt-4o',
      });

      const historyContext = context.messages
        .slice(-10)
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n\n');

      const result = await agent.run(
        `${historyContext}\n\n[user]: ${context.userMessage}`,
      );

      const responseText = typeof result === 'string'
        ? result
        : result?.content || result?.response || JSON.stringify(result);

      // Save assistant response
      await this.saveMessage(context.conversation.id, 'assistant', responseText);

      yield {
        type: 'message',
        data: {
          role: 'assistant',
          content: responseText,
        },
      };
    } catch (error: any) {
      yield { type: 'error', data: { message: error.message } };
    }
  }

  /**
   * Workflow mode — sequential agent execution.
   * Runs each suggested agent in order, passing output from one to the next.
   * Emits agentStart/agentComplete lifecycle events via messageBus (B7 fix).
   */
  private async *handleWorkflow(context: ChatContext): AsyncGenerator<ChatEvent> {
    const agentNames = context.assessment?.suggested_agents || ['pm', 'tech-lead'];
    const total = agentNames.length;

    yield {
      type: 'agent_log',
      data: { message: `Starting workflow: ${agentNames.join(' → ')} (${total} steps)` },
    };

    let previousOutput = context.userMessage;
    const results: Array<{ agent: string; output: any }> = [];

    for (let i = 0; i < agentNames.length; i++) {
      const agentName = agentNames[i];
      const step = i + 1;

      // Publish lifecycle event
      messageBus.agentStart(agentName, step, total);
      yield {
        type: 'agent_log',
        data: { message: `[${step}/${total}] Running agent: ${agentName}...`, agent: agentName },
      };

      try {
        // Check if the agent factory is registered
        if (!hasAgentFactory(agentName)) {
          const available = getAgentFactoryIds().join(', ');
          const errorMsg = `Agent "${agentName}" not registered. Available: [${available}]`;
          messageBus.agentComplete(agentName, { error: errorMsg });
          yield { type: 'agent_log', data: { message: `⚠️ ${errorMsg}`, agent: agentName } };
          results.push({ agent: agentName, output: { error: errorMsg } });
          continue;
        }

        // Dynamically import agent factory — agents register themselves on import
        const agentModule = await this.loadAgentFactory(agentName);
        if (!agentModule) {
          const errorMsg = `Failed to load agent factory for "${agentName}"`;
          messageBus.agentComplete(agentName, { error: errorMsg });
          yield { type: 'agent_log', data: { message: `⚠️ ${errorMsg}`, agent: agentName } };
          results.push({ agent: agentName, output: { error: errorMsg } });
          continue;
        }

        const agent = agentModule();

        // Build input: original request + previous agent output as context
        const agentInput = i === 0
          ? previousOutput
          : `Previous agent (${agentNames[i - 1]}) output:\n${typeof previousOutput === 'string' ? previousOutput : JSON.stringify(previousOutput, null, 2)}\n\nOriginal request:\n${context.userMessage}`;

        const agentResult = await agent.run(agentInput, {
          logger: messageBus.createLogger(agentName),
          projectId: context.conversation.project_id ?? undefined,
        });

        // Store result and pass to next agent
        previousOutput = typeof agentResult === 'string'
          ? agentResult
          : JSON.stringify(agentResult, null, 2);
        results.push({ agent: agentName, output: agentResult });

        messageBus.agentComplete(agentName, agentResult);
        yield {
          type: 'agent_log',
          data: { message: `[${step}/${total}] Agent ${agentName} completed.`, agent: agentName },
        };
      } catch (error: any) {
        messageBus.agentComplete(agentName, { error: error.message });
        yield {
          type: 'agent_log',
          data: { message: `[${step}/${total}] Agent ${agentName} failed: ${error.message}`, agent: agentName },
        };
        results.push({ agent: agentName, output: { error: error.message } });
      }
    }

    // Summarize workflow results
    const summary = results.map(r =>
      `**${r.agent}**: ${r.output?.error ? `Failed — ${r.output.error}` : 'Completed'}`
    ).join('\n');

    const responseText = `Workflow completed.\n\n${summary}`;
    await this.saveMessage(context.conversation.id, 'assistant', responseText);

    yield {
      type: 'message',
      data: { role: 'assistant', content: responseText },
    };
  }

  /**
   * Agent team mode — delegates to the Meta Pipeline (Decision Maker → Architect).
   * Creates a team record for tracking, then runs the full pipeline.
   */
  private async *handleAgentTeam(context: ChatContext): AsyncGenerator<ChatEvent> {
    yield {
      type: 'agent_log',
      data: { message: 'Forming agent team...' },
    };

    // Create team record
    const teamId = await this.createTeam(context.conversation.id, context.assessment);

    yield {
      type: 'team_update',
      data: {
        team_id: teamId,
        status: 'active',
        agents: context.assessment?.suggested_agents || [],
      },
    };

    // Run the meta pipeline with the user's request
    try {
      const pipelineResult = await runMetaPipeline(context.userMessage, {
        projectId: context.conversation.project_id ?? undefined,
        logger: async (msg: string) => {
          // Forward pipeline logs as ChatEvents — cannot yield from callback,
          // so publish to message bus for SSE streaming.
          messageBus.publish({
            from: 'meta-pipeline',
            channel: 'agent-log',
            type: 'agent_log',
            payload: { message: msg },
          });
        },
      });

      const decisionText = pipelineResult.decision
        ? `Decision: ${pipelineResult.decision.decision} (confidence: ${pipelineResult.decision.confidence})`
        : 'Decision: skipped';
      const architectText = pipelineResult.architect
        ? `Architect: ${pipelineResult.architect.steps_completed} steps completed, ${pipelineResult.architect.steps_failed} failed`
        : 'Architect: not executed';

      const responseText = `Agent team execution complete.\n\n${decisionText}\n${architectText}`;

      await this.saveMessage(context.conversation.id, 'assistant', responseText);

      yield {
        type: 'message',
        data: { role: 'assistant', content: responseText },
      };

      // Update team status
      if (supabaseConfigured) {
        await supabase
          .from('agent_teams')
          .update({ status: 'idle' })
          .eq('id', teamId);
      }
    } catch (error: any) {
      const errorMsg = `Agent team execution failed: ${error.message}`;
      await this.saveMessage(context.conversation.id, 'assistant', errorMsg);
      yield { type: 'error', data: { message: errorMsg } };
    }
  }

  /**
   * Agent swarm mode — phased execution for epic-level tasks.
   * Currently delegates to agent_team (single phase). Future: multi-phase with
   * Supervisor validation between phases.
   */
  private async *handleAgentSwarm(context: ChatContext): AsyncGenerator<ChatEvent> {
    yield {
      type: 'agent_log',
      data: { message: 'Initializing agent swarm (Phase 1)...' },
    };

    // Phase 1: same as agent_team
    yield* this.handleAgentTeam(context);
  }

  // ---------------------------------------------------------------------------
  // Agent loading helper
  // ---------------------------------------------------------------------------

  /**
   * Attempt to load an agent factory by name.
   * Agent factories are registered when their modules are imported.
   * Returns the factory function, or null if not loadable.
   */
  private async loadAgentFactory(agentName: string): Promise<(() => BaseAgent) | null> {
    // Map common agent names to their module paths
    const moduleMap: Record<string, () => Promise<any>> = {
      'pm': () => import('@/agents/pm'),
      'tech-lead': () => import('@/agents/tech-lead'),
      'researcher': () => import('@/agents/researcher'),
      'critic': () => import('@/agents/critic'),
      'architect': () => import('@/agents/architect'),
      'decision-maker': () => import('@/agents/decision-maker'),
    };

    // Ensure module is imported so factory is registered
    const loader = moduleMap[agentName];
    if (loader) {
      try {
        const mod = await loader();
        // Module exports a create function like createPMAgent, createArchitectAgent, etc.
        const createFn = Object.values(mod).find(
          (v): v is (...args: any[]) => BaseAgent => typeof v === 'function' && v.name?.startsWith('create')
        );
        if (createFn) return () => createFn();
      } catch {
        // Fall through — factory might already be registered
      }
    }

    // Check if factory was registered (e.g. by a previous import or dynamic creation)
    if (hasAgentFactory(agentName)) {
      // Use dynamic import side-effect: the factory is now in the registry
      // We need to access it via spawn-agent's internal map — use a lightweight wrapper
      return null; // Factory exists but we can't access it directly from here
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

    // Create new conversation
    if (supabaseConfigured) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ status: 'active' })
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

  private async createTeam(
    conversationId: string,
    assessment: ComplexityAssessment | null,
  ): Promise<string> {
    const teamName = `team-${Date.now()}`;
    const leadAgent = 'architect';

    if (supabaseConfigured) {
      const { data } = await supabase
        .from('agent_teams')
        .insert({
          conversation_id: conversationId,
          team_name: teamName,
          lead_agent: leadAgent,
          status: 'forming',
          config: {
            members: assessment?.suggested_agents || [],
            execution_mode: assessment?.execution_mode,
          },
        })
        .select('id')
        .single();

      if (data) return data.id;
    }

    return crypto.randomUUID();
  }
}

/** Singleton instance. */
export const chatEngine = new ChatEngine();
