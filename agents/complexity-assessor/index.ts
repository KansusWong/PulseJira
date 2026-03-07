import { BaseAgent } from '@/lib/core/base-agent';
import { COMPLEXITY_ASSESSOR_PROMPT } from './prompts/system';
import type { AgentContext, ComplexityAssessment } from '@/lib/core/types';

/**
 * Creates a Complexity Assessor agent.
 * Uses runOnce() to produce a structured ComplexityAssessment.
 */
export function createComplexityAssessorAgent(options?: { model?: string }) {
  return new BaseAgent({
    name: 'complexity-assessor',
    systemPrompt: COMPLEXITY_ASSESSOR_PROMPT,
    tools: [],
    maxLoops: 1,
    model: options?.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o',
  });
}

/**
 * Assess the complexity of a user message within a conversation context.
 */
export async function assessComplexity(
  userMessage: string,
  conversationHistory?: string,
  context?: AgentContext,
): Promise<ComplexityAssessment> {
  const agent = createComplexityAssessorAgent();

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
