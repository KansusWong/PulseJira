import { createPlannerAgent } from '@/agents/planner';
import { createAnalystAgent } from '@/agents/analyst';
import { retrieveContext, storeDecision } from '@/lib/services/rag';
import { getRecentRejections } from '@/lib/services/feedback';
import { getCodeContext } from '@/lib/services/context';
import { messageBus } from '@/connectors/bus/message-bus';

export interface PlanResult {
  featureName: string;
  score: number;
  decision: string;
  rationale: string;
  prd: any;
  tasks: any[];
}

interface PlanContext {
  signalId?: string;
  logger?: (message: string) => Promise<void> | void;
  projectId?: string;
  recordUsage?: (params: {
    agentName: string;
    projectId?: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => void;
}

/**
 * Plan Pipeline — PRD Generation + Technical Task Planning using Agent Workspaces.
 *
 * Orchestrates: RAG Context → PM Agent (runOnce) → Tech Lead Agent (ReAct loop)
 */
export async function runPlan(
  requirementContent: string,
  context: PlanContext = {}
): Promise<PlanResult> {
  const log = context.logger || console.log;
  const agentCtx = {
    logger: log,
    signalId: context.signalId,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
  };

  // --- 1. Gather context (Knowledge Curator with fallback) ---
  let visionContext = '';
  let pastDecisions = '';
  let codePatterns = '';
  let codeArtifacts = '';
  try {
    const curator = createAnalystAgent({ mode: 'retrieve' });
    const curatorResult = await curator.run(
      `请为以下需求检索全面的上下文信息：\n\n${requirementContent}`,
      agentCtx
    );
    if (curatorResult && typeof curatorResult === 'object') {
      visionContext = curatorResult.vision_context || '';
      pastDecisions = curatorResult.past_decisions || '';
      codePatterns = curatorResult.code_patterns || '';
      codeArtifacts = curatorResult.code_artifacts || '';
      await log(`[Plan] Knowledge Curator completed (confidence: ${curatorResult.confidence || 'unknown'})`);
    }
  } catch (e: unknown) {
    await log(`[Plan] Knowledge Curator failed: ${e instanceof Error ? e.message : String(e)}. Falling back to basic retrieval.`);
    const ragContext = await retrieveContext(requirementContent);
    visionContext = ragContext.visionContext;
    pastDecisions = ragContext.pastDecisions;
  }
  const negativeExamples = await getRecentRejections();
  const codeContext = getCodeContext();

  // --- 2. PM Agent (single LLM call → PRD) ---
  await log('[Plan] Running Product Manager...');
  messageBus.agentStart('pm', 1, 2);
  const pmAgent = createPlannerAgent({ mode: 'prd' });
  let prd: any;
  const pmPrompt = `
Incoming Signal:
${requirementContent}

Vision Context:
${visionContext}

Past Decisions:
${pastDecisions}

Code Patterns (existing architectural patterns):
${codePatterns}

Please analyze this signal and output a structured PRD.
`;
  // Retry once on failure before giving up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      prd = await pmAgent.runOnce(pmPrompt, agentCtx);
      break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 2) {
        await log(`[Plan] PM Agent attempt ${attempt} failed: ${msg}. Retrying...`);
      } else {
        const errMsg = `PM Agent failed after ${attempt} attempts: ${msg}`;
        await log(`[Plan] ${errMsg}`);
        throw new Error(errMsg);
      }
    }
  }

  if (context.signalId) {
    await storeDecision(context.signalId, requirementContent, 'Product Requirements Defined', prd);
  }

  await log(`[Plan] PRD Generated: "${prd.title}"`);
  messageBus.agentComplete('pm', prd);

  // --- 3. Tech Lead Agent (ReAct loop → task plan) ---
  await log('[Plan] Running Tech Lead...');
  messageBus.agentStart('tech-lead', 2, 2);
  const techAgent = createPlannerAgent({ mode: 'task-plan' });
  let techResult: any;
  const techPrompt = `
PRD (Product Requirements Document):
${JSON.stringify(prd, null, 2)}

Vision Context:
${visionContext}

Past Decisions:
${pastDecisions}

Code Patterns (existing reusable patterns):
${codePatterns}

Code Artifacts (previous implementations):
${codeArtifacts}

Negative Patterns (avoid these):
${negativeExamples}

Initial Code Context:
${codeContext}

Please analyze the codebase and generate development tasks.
`;
  // Retry once on failure before giving up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      techResult = await techAgent.run(techPrompt, agentCtx);
      break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 2) {
        await log(`[Plan] Tech Lead attempt ${attempt} failed: ${msg}. Retrying...`);
      } else {
        const errMsg = `Tech Lead failed after ${attempt} attempts: ${msg}`;
        await log(`[Plan] ${errMsg}`);
        throw new Error(errMsg);
      }
    }
  }

  if (!techResult || !techResult.tasks) {
    throw new Error('Tech Lead completed but did not generate any tasks. The model may have returned an unexpected format.');
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
  messageBus.agentComplete('tech-lead', techResult);
  messageBus.stageComplete('plan', techResult);

  return {
    featureName: prd.title || 'Untitled Feature',
    score: prd.score || 0,
    decision: prd.decision || 'NO_GO',
    rationale: prd.rationale || 'No rationale provided.',
    prd,
    tasks: techResult.tasks,
  };
}
