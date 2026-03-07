import { BaseAgent } from '@/lib/core/base-agent';
import { ARCHITECT_PROMPT } from '@/lib/prompts/architect';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { registerAgentFactory, SpawnAgentTool } from '@/lib/tools/spawn-agent';
import { ListAgentsTool } from '@/lib/tools/list-agents';
import { CreateAgentTool } from '@/lib/tools/create-agent';
import { CreateSkillTool } from '@/lib/tools/create-skill';
import { PersistAgentTool } from '@/lib/tools/persist-agent';
import { PersistSkillTool } from '@/lib/tools/persist-skill';
import { PromoteFeatureTool } from '@/lib/tools/promote-feature';
import { ValidateOutputTool } from '@/lib/tools/validate-output';
import { FinishArchitectTool } from '@/lib/tools/finish-architect';
import { DiscoverSkillsTool } from '@/lib/tools/discover-skills';
import type { BaseTool } from '@/lib/core/base-tool';
import type { AgentContext } from '@/lib/core/types';
import type { Workspace } from '@/lib/sandbox/types';

/**
 * Creates an Architect agent — the dynamic execution brain of the system.
 *
 * Unlike the static Orchestrator, the Architect operates in a ReAct loop,
 * dynamically spawning agents, creating new agents/skills, and validating
 * results step by step. It can also invoke the Supervisor for deep validation.
 */
export function createArchitectAgent(options?: {
  model?: string;
  context?: string;
  workspace?: Workspace;
  extraTools?: BaseTool[];
  onApprovalRequired?: AgentContext['onApprovalRequired'];
}) {
  const override = loadAgentConfig('architect');
  const soul = override.soul ?? loadSoul('architect');
  const prompt = override.systemPrompt ?? ARCHITECT_PROMPT;
  const systemPrompt = mergeSoulWithPrompt(soul, prompt);

  const tools = [
    new SpawnAgentTool(options?.workspace, options?.extraTools, options?.onApprovalRequired),
    new ListAgentsTool(),
    new CreateAgentTool(),
    new CreateSkillTool(),
    new PersistAgentTool(),
    new PersistSkillTool(),
    new PromoteFeatureTool(),
    new ValidateOutputTool(),
    new DiscoverSkillsTool(),
    new FinishArchitectTool(),
    ...getTools('web_search', 'list_files', 'read_file'),
  ];

  return new BaseAgent({
    name: 'architect',
    systemPrompt,
    tools,
    exitToolName: 'finish_architect',
    maxLoops: override.maxLoops ?? 50,
    model: options?.model ?? override.model,
  });
}

registerAgentFactory('architect', createArchitectAgent);
