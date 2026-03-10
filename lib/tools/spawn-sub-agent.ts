/**
 * SpawnSubAgentTool — lightweight sub-agent spawning for single_agent (L2) mode.
 *
 * Differences from SpawnAgentTool (used by Architect in L3):
 * - No workspace / blackboard dependency (lightweight)
 * - Sub-agent tool set limited to parent's allowed subset (no recursive spawn)
 * - Budget-controlled: tracks remaining spawns and total loop consumption
 * - Returns structured result to parent's ReAct loop
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getAgent } from '@/lib/config/agent-registry';
import { hasAgentFactory, getFactory } from '@/lib/tools/spawn-agent';
import { getTools } from '@/lib/tools/tool-registry';
import { messageBus } from '@/connectors/bus/message-bus';
import type { AgentContext } from '../core/types';

// ---------------------------------------------------------------------------
// Sub-agent budget
// ---------------------------------------------------------------------------

export interface SubAgentBudget {
  maxSubAgents: number;
  maxLoopsPerAgent: number;
  remainingSpawns: number;
  totalLoopsUsed: number;
  totalLoopsBudget: number;
}

export function createDefaultBudget(): SubAgentBudget {
  return {
    maxSubAgents: 3,
    maxLoopsPerAgent: 5,
    remainingSpawns: 3,
    totalLoopsUsed: 0,
    totalLoopsBudget: 15,
  };
}

// Tools that sub-agents are allowed to use (no spawn capability — prevents recursion)
const SUB_AGENT_ALLOWED_TOOLS = ['web_search', 'read_file', 'list_files'] as const;
const MAX_SUB_AGENT_LOOPS = 5;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SpawnSubAgentInputSchema = z.object({
  agent_name: z.string().describe(
    'Name of a built-in agent to spawn (e.g. "analyst", "reviewer", "developer", "planner"). Use list_agents to discover available agents.',
  ),
  task_description: z.string().describe(
    'Clear, self-contained description of what the sub-agent should accomplish. Include: objective, expected output format, and any constraints. The sub-agent cannot see your conversation history — provide all necessary context here.',
  ),
  input_data: z.string().optional().describe(
    'Additional context or data the sub-agent needs (e.g. code snippets, research findings, specifications).',
  ),
  max_loops: z.number().optional().describe(
    `Max reasoning steps for this sub-agent (default: 3, max: ${MAX_SUB_AGENT_LOOPS}). Use fewer for simple lookups, more for complex analysis.`,
  ),
});

type SpawnSubAgentInput = z.infer<typeof SpawnSubAgentInputSchema>;

interface SpawnSubAgentOutput {
  agent_name: string;
  status: 'success' | 'error' | 'rejected';
  output?: unknown;
  reason?: string;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class SpawnSubAgentTool extends BaseTool<SpawnSubAgentInput, SpawnSubAgentOutput> {
  name = 'spawn_sub_agent';
  description =
    'Spawn a temporary sub-agent to handle a focused subtask. The sub-agent runs in isolation (cannot see your conversation), completes the task, and returns results to you. Use for tasks that benefit from specialist focus — research, analysis, code review, validation. You remain the coordinator: decompose, delegate, then synthesize.';
  schema = SpawnSubAgentInputSchema;

  private budget: SubAgentBudget;
  private parentContext?: AgentContext;

  constructor(budget: SubAgentBudget, parentContext?: AgentContext) {
    super();
    this.budget = budget;
    this.parentContext = parentContext;
  }

  protected async _run(input: SpawnSubAgentInput): Promise<SpawnSubAgentOutput> {
    const start = Date.now();
    const { agent_name, task_description, input_data, max_loops } = input;

    // --- Guard: budget ---
    if (this.budget.remainingSpawns <= 0) {
      return {
        agent_name,
        status: 'rejected',
        reason: `Sub-agent spawn budget exhausted (limit: ${this.budget.maxSubAgents}).`,
        duration_ms: Date.now() - start,
      };
    }

    const loops = Math.min(max_loops ?? 3, MAX_SUB_AGENT_LOOPS);
    if (this.budget.totalLoopsUsed + loops > this.budget.totalLoopsBudget) {
      return {
        agent_name,
        status: 'rejected',
        reason: `Total loop budget would be exceeded (${this.budget.totalLoopsUsed}/${this.budget.totalLoopsBudget} used).`,
        duration_ms: Date.now() - start,
      };
    }

    // --- Guard: agent exists ---
    if (!hasAgentFactory(agent_name)) {
      return {
        agent_name,
        status: 'error',
        reason: `Unknown agent: "${agent_name}". Use list_agents to see available agents.`,
        duration_ms: Date.now() - start,
      };
    }

    // --- Create & run ---
    try {
      const factory = getFactory(agent_name);
      if (!factory) {
        throw new Error(`Agent factory "${agent_name}" not found.`);
      }

      const subTools = getTools(...SUB_AGENT_ALLOWED_TOOLS);
      const meta = getAgent(agent_name);
      const agent = factory({ maxLoops: loops, extraTools: subTools });

      const userMessage = input_data
        ? `${task_description}\n\n--- Context ---\n${input_data}`
        : task_description;

      const context: AgentContext = {
        logger: this.parentContext?.logger,
        traceId: this.parentContext?.traceId,
        projectId: this.parentContext?.projectId,
        recordUsage: this.parentContext?.recordUsage,
      };

      // Emit start event
      messageBus.publish({
        from: 'chat-assistant',
        to: agent_name,
        channel: 'single-agent',
        type: 'sub_agent_start',
        payload: { agent_name, task: task_description.slice(0, 200) },
      });

      // Run: single-shot agents get runOnce, react agents get full run
      const useSingleShot = meta?.runMode === 'single-shot';
      const result = useSingleShot
        ? await agent.runOnce(userMessage, context)
        : await agent.run(userMessage, context);

      // Update budget
      this.budget.remainingSpawns--;
      this.budget.totalLoopsUsed += loops;

      // Emit completion event
      messageBus.publish({
        from: agent_name,
        to: 'chat-assistant',
        channel: 'single-agent',
        type: 'sub_agent_complete',
        payload: { agent_name, status: 'success', duration_ms: Date.now() - start },
      });

      return {
        agent_name,
        status: 'success',
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error: any) {
      messageBus.publish({
        from: agent_name,
        to: 'chat-assistant',
        channel: 'single-agent',
        type: 'sub_agent_complete',
        payload: { agent_name, status: 'error', error: error.message, duration_ms: Date.now() - start },
      });

      return {
        agent_name,
        status: 'error',
        output: { error: error.message },
        duration_ms: Date.now() - start,
      };
    }
  }
}
