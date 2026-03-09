import { runPrepare, type PrepareResult } from '@/skills/prepare-pipeline';
import { runPlan, type PlanResult } from '@/skills/plan-pipeline';
import { storeSignal } from '@/lib/services/rag';
import { updateSignalStatus } from '@/lib/services/signal';
import { updateProject } from './project-service';
import { messageBus } from '@/connectors/bus/message-bus';

interface RunnerContext {
  projectId: string;
  logger?: (message: string) => Promise<void> | void;
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
 * Project Agent Pipeline Runner.
 * Manages the full lifecycle of running agents for a project.
 */
export async function runProjectPrepare(
  projectId: string,
  description: string,
  urls: string[],
  context: RunnerContext
): Promise<PrepareResult> {
  const log = context.logger || console.log;

  // 1. Store signal
  const urlText = urls.length > 0
    ? urls.map(u => `Reference/Competitor URL: ${u}`).join('\n')
    : '';
  const signalContent = `New Idea: ${description}\n${urlText}`;
  const signalSource = urls.join(',') || 'user-input-idea';
  const signal = await storeSignal(signalSource, signalContent);
  const signalId = signal?.id;

  await log(`[System] Signal stored with ID: ${signalId}`);

  // 2. Update project with signal
  if (signalId) {
    await updateProject(projectId, { signal_id: signalId, status: 'analyzing' });
  }

  // 3. Run Prepare Pipeline
  await log('[System] Initializing Circuit Breaker analysis...');
  const prepareResult = await runPrepare(description, {
    signalId,
    logger: log,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
  });

  if (signalId) {
    await updateSignalStatus(signalId, 'ANALYZED');
  }

  // 4. Store result on project (include signalId so it persists across reloads)
  await updateProject(projectId, {
    prepare_result: { ...prepareResult, signalId },
    status: prepareResult.decision === 'PROCEED' ? 'analyzing' : 'draft',
  });

  await log(`[Prepare] Analysis Complete. Decision: ${prepareResult.decision}`);
  return { ...prepareResult, signalId } as any;
}

export async function runProjectPlan(
  projectId: string,
  signalId: string,
  confirmedProposal: string,
  context: RunnerContext
): Promise<PlanResult> {
  const log = context.logger || console.log;

  await log('[System] Initializing Planning pipeline...');
  const planResult = await runPlan(confirmedProposal, {
    signalId,
    logger: log,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
  });

  // Store result on project
  await updateProject(projectId, {
    plan_result: planResult,
    status: 'planned',
  });

  messageBus.pipelineComplete(planResult);
  return planResult;
}
