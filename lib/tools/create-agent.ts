import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { BaseAgent } from '../core/base-agent';
import { registerAgentFactory, deregisterAgentFactory } from './spawn-agent';
import { registerAgent, deregisterAgent } from '@/lib/config/agent-registry';
import { isToolRegistered, getTools } from './tool-registry';
import { messageBus } from '@/connectors/bus/message-bus';
import { mergeSoulWithPrompt } from '@/agents/utils';
import type { DynamicAgentDefinition } from '../core/types';

const CreateAgentInputSchema = z.object({
  name: z.string().describe('Unique agent identifier (e.g., "api-migration-specialist")'),
  role: z.string().describe('Short role description'),
  system_prompt: z.string().describe('Complete system prompt for the new agent'),
  tools: z.array(z.string()).describe('Tool names from the tool registry (e.g., ["list_files", "read_file", "code_write"])'),
  max_loops: z.number().default(10).describe('Maximum ReAct loop iterations'),
  run_mode: z.enum(['react', 'single-shot']).default('react').describe('Execution mode'),
  soul: z.string().optional().describe('Optional soul content (philosophy, behavior rules). If omitted, one will be auto-generated from role and system_prompt.'),
  project_id: z.string().optional().describe('Project ID to associate this agent with (medium execution mode).'),
});

type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

interface CreateAgentOutput {
  id: string;
  name: string;
  status: 'registered';
}

// --- Dynamic agent store with TTL-based eviction ---

/** Maximum number of dynamic agents kept in memory. */
const MAX_DYNAMIC_AGENTS = 50;
/** Time-to-live for idle dynamic agents (ms). Default: 1 hour. */
const DYNAMIC_AGENT_TTL_MS = 60 * 60 * 1000;

/** Store of dynamic agent definitions for persistence and cleanup. */
const dynamicAgents = new Map<string, DynamicAgentDefinition>();
/** Creation timestamps for TTL tracking. */
const dynamicAgentTimestamps = new Map<string, number>();

export function getDynamicAgent(id: string): DynamicAgentDefinition | undefined {
  return dynamicAgents.get(id);
}

export function getAllDynamicAgents(): DynamicAgentDefinition[] {
  return Array.from(dynamicAgents.values());
}

/**
 * Remove a dynamic agent from ALL registries (dynamicAgents, agentFactories, agent-registry).
 */
export function removeDynamicAgent(id: string): boolean {
  dynamicAgentTimestamps.delete(id);
  deregisterAgentFactory(id);
  deregisterAgent(id);
  return dynamicAgents.delete(id);
}

/**
 * Evict expired or excess dynamic agents.
 * Called automatically before creating a new agent.
 */
function evictStaleDynamicAgents(): void {
  const now = Date.now();

  // 1. Remove entries that exceed TTL
  for (const [id, ts] of dynamicAgentTimestamps) {
    const def = dynamicAgents.get(id);
    // Never evict persistent agents
    if (def?.persistent) continue;
    if (now - ts > DYNAMIC_AGENT_TTL_MS) {
      removeDynamicAgent(id);
    }
  }

  // 2. If still over limit, evict oldest non-persistent entries
  if (dynamicAgents.size > MAX_DYNAMIC_AGENTS) {
    const sorted = [...dynamicAgentTimestamps.entries()]
      .filter(([id]) => !dynamicAgents.get(id)?.persistent)
      .sort((a, b) => a[1] - b[1]);

    const toEvict = dynamicAgents.size - MAX_DYNAMIC_AGENTS;
    for (let i = 0; i < toEvict && i < sorted.length; i++) {
      removeDynamicAgent(sorted[i][0]);
    }
  }
}

/**
 * Auto-generate a soul.md content from the agent's role and system prompt.
 * Follows the same structure as hand-written soul.md files.
 */
function generateSoul(
  name: string,
  role: string,
  systemPrompt: string,
  tools: string[],
): string {
  const hasCodeTools = tools.some((t) =>
    ['code_write', 'code_edit', 'run_command', 'run_tests'].includes(t),
  );

  const lines: string[] = [
    `# ${name} — ${role}`,
    '',
    '> AI-generated agent by Architect',
    '',
    '## 哲学',
    '',
    '- **专注目标**：只做分配给你的任务，不越界',
    '- **质量优先**：宁可少做也不出错',
    '- **透明沟通**：遇到问题时明确报告，不隐藏错误',
    '',
    '## 行为准则',
    '',
    '- 动手之前先理解上下文和约束',
    '- 每步操作后验证结果',
    '- 遇到连续失败时停下来重新审视方案',
  ];

  if (hasCodeTools) {
    lines.push(
      '',
      '## 工具使用纪律',
      '',
      '- 写代码前，先用 list_files / read_file 确认文件是否存在',
      '- 文件不存在 → code_write；文件已存在 → code_edit',
      '- 禁止对不存在的文件调用 code_edit',
      '- 如果 code_edit 报错 "File not found"，立即改用 code_write',
    );
  }

  return lines.join('\n');
}

/**
 * Architect-exclusive tool that creates a new agent at runtime.
 *
 * The created agent is registered in both the factory registry (for spawn_agent)
 * and the metadata registry (for list_agents). By default it is session-level
 * (non-persistent). Use persist_agent to save to disk.
 */
export class CreateAgentTool extends BaseTool<CreateAgentInput, CreateAgentOutput> {
  name = 'create_agent';
  description = '动态创建一个新的 Agent。指定名称、角色、系统提示词和工具列表。创建后可通过 spawn_agent 调用。默认为临时（会话级），使用 persist_agent 可持久化。';
  schema = CreateAgentInputSchema as z.ZodType<CreateAgentInput>;

  protected async _run(input: CreateAgentInput): Promise<CreateAgentOutput> {
    const { name, role, system_prompt, tools, max_loops, run_mode, project_id } = input;

    // Evict stale/excess dynamic agents before creating a new one
    evictStaleDynamicAgents();

    // Validate all tool names exist
    const invalidTools = tools.filter((t) => !isToolRegistered(t));
    if (invalidTools.length > 0) {
      throw new Error(
        `Unknown tools: [${invalidTools.join(', ')}]. Use list_agents or check tool registry for valid names.`
      );
    }

    // Generate soul: use provided content or auto-generate from role + system_prompt
    const soul = input.soul || generateSoul(name, role, system_prompt, tools);

    // Generate unique ID
    const id = `dynamic-${name}-${crypto.randomUUID().slice(0, 8)}`;

    // Store definition
    const definition: DynamicAgentDefinition = {
      id,
      name,
      role,
      system_prompt,
      tools,
      max_loops: max_loops ?? 10,
      run_mode: run_mode ?? 'react',
      persistent: false,
      soul,
      projectId: project_id,
      createdInMode: project_id ? 'medium' : undefined,
    };
    dynamicAgents.set(id, definition);
    dynamicAgentTimestamps.set(id, Date.now());

    // Register factory — compose prompt via shared merger
    registerAgentFactory(id, () => {
      const toolInstances = getTools(...definition.tools);
      const fullPrompt = mergeSoulWithPrompt(definition.soul || '', definition.system_prompt);
      return new BaseAgent({
        name: definition.name,
        systemPrompt: fullPrompt,
        tools: toolInstances,
        maxLoops: definition.max_loops,
      });
    });

    // Register metadata for list_agents visibility
    registerAgent({
      id,
      displayName: `[AI] ${name}`,
      role,
      runMode: run_mode ?? 'react',
      defaultMaxLoops: max_loops ?? 10,
      defaultPrompt: system_prompt.slice(0, 200) + '...',
      tools: tools.map((t) => ({ name: t, description: '' })),
      skills: [],
      isAIGenerated: true,
      createdBy: 'architect',
      projectId: project_id,
    });

    // Publish event
    messageBus.publish({
      from: 'architect',
      channel: 'meta-pipeline',
      type: 'meta_create_agent',
      payload: { id, name, role, tools, isAIGenerated: true, projectId: project_id },
    });

    return { id, name, status: 'registered' };
  }
}
