/**
 * Chat Judge Agent — renamed and enhanced from complexity-assessor.
 *
 * Evaluates user request complexity (L1/L2/L3) and selects execution mode.
 * Registered in spawn registry so it is visible to the Architect.
 */

import { BaseAgent } from '@/lib/core/base-agent';
import { CHAT_JUDGE_PROMPT } from './prompts/system';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import type { AgentContext, ComplexityAssessment } from '@/lib/core/types';

export function createChatJudgeAgent(options?: { model?: string }) {
  const soul = loadSoul('chat-judge');
  const systemPrompt = mergeSoulWithPrompt(soul, CHAT_JUDGE_PROMPT);

  return new BaseAgent({
    name: 'chat-judge',
    systemPrompt,
    tools: [],
    maxLoops: 1,
    model: options?.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o',
  });
}

/**
 * Convenience function: assess complexity of a user message.
 * Returns a structured ComplexityAssessment.
 */
export async function assessComplexity(
  userMessage: string,
  conversationHistory?: string,
  context?: AgentContext,
): Promise<ComplexityAssessment> {
  const agent = createChatJudgeAgent();

  const prompt = conversationHistory
    ? `## Conversation History\n${conversationHistory}\n\n## Current User Message\n${userMessage}`
    : userMessage;

  const result = await agent.runOnce(prompt, context ?? {});

  // Validate and provide defaults
  return {
    complexity_level: result.complexity_level ?? 'L1',
    execution_mode: result.execution_mode ?? 'direct',
    rationale: result.rationale ?? 'Assessment completed.',
    suggested_agents: result.suggested_agents ?? [],
    estimated_steps: result.estimated_steps ?? 1,
    plan_outline: result.plan_outline ?? [],
    requires_project: result.requires_project ?? false,
    requires_clarification: result.requires_clarification ?? false,
  };
}

registerAgentFactory('chat-judge', createChatJudgeAgent);
