import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { BaseAgent } from '../core/base-agent';
import { getAgent } from '@/lib/config/agent-registry';
import { messageBus } from '@/connectors/bus/message-bus';
import type { BaseTool as BaseToolType } from '../core/base-tool';
import type { AgentContext } from '../core/types';
import type { Workspace } from '@/lib/sandbox/types';
import type { Blackboard } from '@/lib/blackboard/blackboard';

// ---------------------------------------------------------------------------
// Agent Factory Registry (Map-backed, same pattern as tool-registry)
// ---------------------------------------------------------------------------

type AgentFactory = (options?: any) => BaseAgent;

const agentFactories = new Map<string, AgentFactory>();

/** Register an agent factory function by agent ID. */
export function registerAgentFactory(id: string, factory: AgentFactory): void {
  agentFactories.set(id, factory);
}

/** Remove a factory by agent ID. */
export function deregisterAgentFactory(id: string): boolean {
  return agentFactories.delete(id);
}

/** Check if a factory is registered. */
export function hasAgentFactory(id: string): boolean {
  return agentFactories.has(id);
}

/** Get all registered factory IDs. */
export function getAgentFactoryIds(): string[] {
  return Array.from(agentFactories.keys());
}

/** Retrieve an agent factory by ID (returns undefined if not found). */
export function getFactory(id: string): AgentFactory | undefined {
  return agentFactories.get(id);
}

// ---------------------------------------------------------------------------
// SpawnAgentTool
// ---------------------------------------------------------------------------

const SpawnAgentInputSchema = z.object({
  agent_name: z.string().describe(
    'Agent ID to spawn (e.g., "researcher", "pm", "developer", "supervisor"). Use list_agents to see available agents.'
  ),
  task_description: z.string().describe(
    'Detailed description of what this sub-agent should accomplish'
  ),
  input_data: z.string().optional().describe(
    'Additional context or data to include in the agent prompt'
  ),
  max_loops: z.number().optional().describe(
    'Override the agent default max loops'
  ),
});

type SpawnAgentInput = z.infer<typeof SpawnAgentInputSchema>;

interface SpawnAgentOutput {
  agent_name: string;
  status: 'success' | 'error';
  output: any;
  duration_ms: number;
}

/**
 * Core meta-tool that dynamically spawns and runs a sub-agent.
 *
 * The Architect uses this to invoke any registered agent (including
 * dynamically created ones) in its ReAct loop.
 *
 * Optionally accepts a `Workspace` for agents that need workspace-scoped tools.
 */
export class SpawnAgentTool extends BaseTool<SpawnAgentInput, SpawnAgentOutput> {
  name = 'spawn_agent';
  description = '动态创建并运行一个子 Agent。指定 agent_name（可通过 list_agents 查看）和任务描述。Agent 将独立执行并返回结果。';
  schema = SpawnAgentInputSchema;

  private workspace?: Workspace;
  private extraTools?: BaseToolType[];
  private onApprovalRequired?: AgentContext['onApprovalRequired'];
  private blackboard?: Blackboard;

  constructor(workspace?: Workspace, extraTools?: BaseToolType[], onApprovalRequired?: AgentContext['onApprovalRequired'], blackboard?: Blackboard) {
    super();
    this.workspace = workspace;
    this.extraTools = extraTools;
    this.onApprovalRequired = onApprovalRequired;
    this.blackboard = blackboard;
  }

  protected async _run(input: SpawnAgentInput): Promise<SpawnAgentOutput> {
    const start = Date.now();
    const { agent_name, task_description, input_data, max_loops } = input;

    // Look up factory
    const factory = agentFactories.get(agent_name);
    if (!factory) {
      const available = getAgentFactoryIds().join(', ');
      throw new Error(
        `Agent "${agent_name}" not found in factory registry. Available: [${available}]`
      );
    }

    // Get metadata for run mode detection
    const meta = getAgent(agent_name);

    // Build options for the factory
    const factoryOptions: any = {};
    if (max_loops) factoryOptions.maxLoops = max_loops;
    if (this.workspace) {
      factoryOptions.tools = this.extraTools;
      factoryOptions.context = input_data;
      factoryOptions.taskDescription = task_description;
    }
    if (this.blackboard) {
      factoryOptions.blackboard = this.blackboard;
    }

    // Create agent
    const agent = factory(factoryOptions);

    // Compose user message
    const userMessage = input_data
      ? `${task_description}\n\n--- Additional Context ---\n${input_data}`
      : task_description;

    // Publish start event
    messageBus.publish({
      from: 'architect',
      to: agent_name,
      channel: 'meta-pipeline',
      type: 'meta_spawn',
      payload: { agent_name, task_description: task_description.slice(0, 200) },
    });

    // Run agent
    let output: any;
    try {
      const useSingleShot = meta?.runMode === 'single-shot';
      const agentContext = {
        logger: messageBus.createLogger(agent_name),
        onApprovalRequired: this.onApprovalRequired,
      };
      output = useSingleShot
        ? await agent.runOnce(userMessage, agentContext)
        : await agent.run(userMessage, agentContext);
    } catch (error: any) {
      return {
        agent_name,
        status: 'error',
        output: { error: error.message },
        duration_ms: Date.now() - start,
      };
    }

    return {
      agent_name,
      status: 'success',
      output,
      duration_ms: Date.now() - start,
    };
  }
}
