import { createPlannerAgent } from '@/agents/planner';
import { retrieveContext, storeDecision } from '../services/rag';
import { getRecentRejections } from '../services/feedback';
import { getCodeContext } from '../services/context';
import type { PlanTask } from '../tools/finish-planning';

export interface PlanResult {
  featureName: string;
  score: number;
  decision: string;
  rationale: string;
  prd: any;
  tasks: PlanTask[];
}

interface PlanContext {
  signalId?: string;
  logger?: (message: string) => Promise<void> | void;
}

/**
 * Plan Skill — PRD Generation + Technical Task Planning workflow.
 *
 * Orchestrates: RAG Context → PM Agent (runOnce) → Tech Lead Agent (ReAct loop)
 *
 * Returns a complete feature analysis with PRD and actionable development tasks.
 */
export async function runPlan(
  requirementContent: string,
  context: PlanContext = {}
): Promise<PlanResult> {
  const log = context.logger || console.log;

  // --- 1. Gather context ---
  const ragContext = await retrieveContext(requirementContent);
  const negativeExamples = await getRecentRejections();
  const codeContext = getCodeContext();

  // --- 2. PM Agent (single LLM call → PRD) ---
  await log('[Plan] Running Product Manager...');
  const pmAgent = createPlannerAgent({ mode: 'prd' });
  const prd = await pmAgent.runOnce(`
Incoming Signal:
${requirementContent}

Vision Context:
${ragContext.visionContext}

Past Decisions:
${ragContext.pastDecisions}

Please analyze this signal and output a structured PRD.
`, { signalId: context.signalId, logger: log });

  if (context.signalId) {
    await storeDecision(context.signalId, requirementContent, 'Product Requirements Defined', prd);
  }

  await log(`[Plan] PRD Generated: "${prd.title}"`);

  // --- 3. Tech Lead Agent (ReAct loop → task plan) ---
  await log('[Plan] Running Tech Lead...');
  const techAgent = createPlannerAgent({ mode: 'task-plan' });
  const techResult = await techAgent.run(`
PRD (Product Requirements Document):
${JSON.stringify(prd, null, 2)}

Vision Context:
${ragContext.visionContext}

Past Decisions:
${ragContext.pastDecisions}

Negative Patterns (avoid these):
${negativeExamples}

Initial Code Context:
${codeContext}

Please analyze the codebase and generate development tasks.
`, { signalId: context.signalId, logger: log });

  if (!techResult || !techResult.tasks) {
    throw new Error('Tech Lead failed to generate tasks');
  }

  if (context.signalId) {
    await storeDecision(
      context.signalId,
      requirementContent,
      techResult.rationale || 'Technical Plan Created',
      techResult
    );
  }

  await log(`[Plan] Planning Complete. Generated ${techResult.tasks.length} tasks.`);

  return {
    featureName: prd.title || 'Untitled Feature',
    score: prd.score || 0,
    decision: prd.decision || 'NO_GO',
    rationale: prd.rationale || 'No rationale provided.',
    prd,
    tasks: techResult.tasks,
  };
}
