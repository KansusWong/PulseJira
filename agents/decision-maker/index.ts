import { BaseAgent } from '@/lib/core/base-agent';
import { DECISION_MAKER_PROMPT } from '@/lib/prompts/decision-maker';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { SpawnAgentTool } from '@/lib/tools/spawn-agent';
import { ListAgentsTool } from '@/lib/tools/list-agents';
import { FinishDecisionTool } from '@/lib/tools/finish-decision';
import { BlackboardReadTool } from '@/lib/tools/blackboard-read';
import { BlackboardWriteTool } from '@/lib/tools/blackboard-write';
import type { Blackboard } from '@/lib/blackboard/blackboard';

/**
 * Creates a Decision Maker agent that gathers information from multiple
 * sources and produces structured decisions with confidence scores.
 *
 * Uses spawn_agent to invoke sub-agents (researcher, blue-team, critic,
 * arbitrator, knowledge-curator) and aggregates their outputs.
 */
export function createDecisionMakerAgent(options?: { model?: string; context?: string; blackboard?: Blackboard }) {
  const override = loadAgentConfig('decision-maker');
  const soul = override.soul ?? loadSoul('decision-maker');
  const prompt = override.systemPrompt ?? DECISION_MAKER_PROMPT;
  const systemPrompt = mergeSoulWithPrompt(soul, prompt);

  const tools = [
    new SpawnAgentTool(),
    new ListAgentsTool(),
    new FinishDecisionTool(),
    ...getTools('web_search', 'search_vision_knowledge', 'search_decisions'),
  ];

  if (options?.blackboard) {
    tools.push(new BlackboardReadTool(options.blackboard));
    tools.push(new BlackboardWriteTool(options.blackboard, 'decision_maker'));
  }

  return new BaseAgent({
    name: 'decision_maker',
    systemPrompt,
    tools,
    exitToolName: 'finish_decision',
    maxLoops: override.maxLoops ?? 15,
    model: options?.model ?? override.model,
  });
}

registerAgentFactory('decision-maker', createDecisionMakerAgent);
