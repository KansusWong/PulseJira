import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getAllAgents } from '@/lib/config/agent-registry';
import { ensureDynamicAgentsLoaded } from '@/lib/config/dynamic-agents';

const ListAgentsInputSchema = z.object({
  category: z
    .enum(['all', 'evaluation', 'planning', 'implementation', 'review', 'meta', 'deploy'])
    .default('all')
    .describe('Filter agents by category (default: all)'),
});

type ListAgentsInput = z.infer<typeof ListAgentsInputSchema>;

/** Category mapping for agent IDs — updated for 8 core agents. */
const AGENT_CATEGORIES: Record<string, string> = {
  'analyst': 'evaluation',
  'planner': 'planning',
  'developer': 'implementation',
  'reviewer': 'review',
  'deployer': 'deploy',
  'decision-maker': 'meta',
  'architect': 'meta',
  'chat-judge': 'meta',
};

interface AgentSummary {
  id: string;
  displayName: string;
  role: string;
  runMode: string;
  category: string;
  tools: string[];
  skills: string[];
}

/**
 * Introspection tool that lists available agents and their capabilities.
 * Used by the Architect to discover what agents can be spawned.
 */
export class ListAgentsTool extends BaseTool<ListAgentsInput, AgentSummary[]> {
  name = 'list_agents';
  description = '列出系统中所有可用的 Agent 及其能力（包括动态创建的临时 Agent）。用于了解有哪些 Agent 可以被 spawn_agent 调用。';
  schema = ListAgentsInputSchema as z.ZodType<ListAgentsInput>;

  protected async _run(input: ListAgentsInput): Promise<AgentSummary[]> {
    // Lazy-load persisted dynamic agents on first call
    ensureDynamicAgentsLoaded();
    const all = getAllAgents();
    const agents = all
      .map((a) => ({
        id: a.id,
        displayName: a.displayName,
        role: a.role,
        runMode: a.runMode,
        category: AGENT_CATEGORIES[a.id] || 'other',
        tools: a.tools.map((t) => t.name),
        skills: a.skills.map((s) => s.name),
      }))
      .filter((a) => input.category === 'all' || a.category === input.category);

    return agents;
  }
}
