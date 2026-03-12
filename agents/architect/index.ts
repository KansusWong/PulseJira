import { BaseAgent } from '@/lib/core/base-agent';
import { ARCHITECT_PROMPT } from '@/lib/prompts/architect';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { FileReadTool } from '@/lib/tools/fs-read';
import { FileListTool } from '@/lib/tools/fs-list';
import { WebSearchTool } from '@/lib/tools/web-search';
import { registerAgentFactory, SpawnAgentTool } from '@/lib/tools/spawn-agent';
import { ListAgentsTool } from '@/lib/tools/list-agents';
import { CreateAgentTool } from '@/lib/tools/create-agent';
import { CreateSkillTool } from '@/lib/tools/create-skill';
import { CreateSubAgentTool } from '@/lib/tools/create-sub-agent';
import { PersistAgentTool } from '@/lib/tools/persist-agent';
import { PersistSkillTool } from '@/lib/tools/persist-skill';
import { PromoteFeatureTool } from '@/lib/tools/promote-feature';
import { ValidateOutputTool } from '@/lib/tools/validate-output';
import { FinishArchitectTool } from '@/lib/tools/finish-architect';
import { DiscoverSkillsTool } from '@/lib/tools/discover-skills';
import { ReportPlanProgressTool } from '@/lib/tools/report-plan-progress';
import { ViewTeamStatusTool } from '@/lib/tools/view-team-status';
import type { BaseTool } from '@/lib/core/base-tool';
import type { AgentContext } from '@/lib/core/types';
import type { Workspace } from '@/lib/sandbox/types';
import { BlackboardReadTool } from '@/lib/tools/blackboard-read';
import { BlackboardWriteTool } from '@/lib/tools/blackboard-write';
import { ProposeSolutionsTool } from '@/lib/tools/propose-solutions';
import type { Blackboard } from '@/lib/blackboard/blackboard';
import type { TrustLevel } from '@/lib/services/preferences-store';

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
  blackboard?: Blackboard;
  /** Pre-seeded conversation history for resuming an incomplete run. */
  initialMessages?: any[];
  /** Execution mode from user preferences — gates which tools are available. */
  execMode?: 'simple' | 'medium';
  /** Team ID for team-aware tools (view_team_status). */
  teamId?: string;
  /** Trust level from user preferences — controls solution proposal behavior. */
  trustLevel?: TrustLevel;
}) {
  const override = loadAgentConfig('architect');
  const soul = override.soul ?? loadSoul('architect');
  const prompt = override.systemPrompt ?? ARCHITECT_PROMPT;
  const systemPrompt = mergeSoulWithPrompt(soul, prompt);
  const execMode = options?.execMode || 'simple';
  const trustLevel = options?.trustLevel || 'collaborative';

  // ── Base tools (available in all modes) ──
  const tools: BaseTool[] = [
    new SpawnAgentTool(options?.workspace, options?.extraTools, options?.onApprovalRequired, options?.blackboard),
    new ListAgentsTool(),
    new CreateSubAgentTool(),
    new ValidateOutputTool(),
    new DiscoverSkillsTool(),
    new ReportPlanProgressTool(),
    new ProposeSolutionsTool(trustLevel, options?.blackboard),
    new FinishArchitectTool(),
    new WebSearchTool(),
    new FileListTool(options?.workspace?.localPath || '.'),
    new FileReadTool(options?.workspace?.localPath || '.'),
  ];

  // ── Medium-only tools (full team orchestration capabilities) ──
  if (execMode === 'medium') {
    tools.push(
      new CreateAgentTool(),
      new CreateSkillTool(),
      new PersistAgentTool(),
      new PersistSkillTool(),
      new PromoteFeatureTool(),
    );
    if (options?.teamId && options?.blackboard) {
      tools.push(new ViewTeamStatusTool(options.teamId, options.blackboard));
    }
  }

  // ── Blackboard tools (all modes, when blackboard is available) ──
  if (options?.blackboard) {
    tools.push(new BlackboardReadTool(options.blackboard));
    tools.push(new BlackboardWriteTool(options.blackboard, 'architect'));
  }

  return new BaseAgent({
    name: 'architect',
    systemPrompt,
    tools,
    exitToolName: 'finish_architect',
    maxLoops: override.maxLoops ?? 50,
    model: options?.model ?? override.model,
    initialMessages: options?.initialMessages,
  });
}

registerAgentFactory('architect', createArchitectAgent);
