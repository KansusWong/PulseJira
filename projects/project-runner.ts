import { runPrepare, type PrepareResult } from '@/skills/prepare-pipeline';
import { runPreparePOC } from '@/skills/poc-prepare-pipeline';
import { runPlan, type PlanResult } from '@/skills/plan-pipeline';
import { storeSignal } from '@/lib/services/rag';
import { updateSignalStatus } from '@/lib/services/signal';
import { updateProject } from './project-service';
import { messageBus } from '@/connectors/bus/message-bus';
import type { PipelineCheckpoint } from './types';

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
  context: RunnerContext,
  checkpoint?: PipelineCheckpoint | null
): Promise<PrepareResult> {
  const log = context.logger || console.log;

  const onCheckpoint = (cp: PipelineCheckpoint) => {
    updateProject(projectId, { pipeline_checkpoint: cp }).catch((err) =>
      console.error('[runner] Write prepare checkpoint failed:', err)
    );
  };

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
    checkpoint,
    onCheckpoint,
  });

  if (signalId) {
    await updateSignalStatus(signalId, 'ANALYZED');
  }

  // 4. Store result on project (include signalId so it persists across reloads)
  // Clear checkpoint on success
  await updateProject(projectId, {
    prepare_result: { ...prepareResult, signalId },
    status: prepareResult.decision === 'PROCEED' ? 'analyzing' : 'draft',
    pipeline_checkpoint: null,
  });

  await log(`[Prepare] Analysis Complete. Decision: ${prepareResult.decision}`);
  return { ...prepareResult, signalId } as any;
}

/**
 * POC/Demo Prepare — lightweight path that only runs Knowledge Curator
 * to find reusable assets, then auto-PROCEEDs.
 */
export async function runProjectPreparePOC(
  projectId: string,
  description: string,
  urls: string[],
  context: RunnerContext,
  checkpoint?: PipelineCheckpoint | null
): Promise<PrepareResult> {
  const log = context.logger || console.log;

  const onCheckpoint = (cp: PipelineCheckpoint) => {
    updateProject(projectId, { pipeline_checkpoint: cp }).catch((err) =>
      console.error('[runner] Write POC prepare checkpoint failed:', err)
    );
  };

  // 1. Store signal
  const urlText = urls.length > 0
    ? urls.map(u => `Reference URL: ${u}`).join('\n')
    : '';
  const signalContent = `POC/Demo: ${description}\n${urlText}`;
  const signalSource = urls.join(',') || 'user-input-poc';
  const signal = await storeSignal(signalSource, signalContent);
  const signalId = signal?.id;

  await log(`[System] POC signal stored with ID: ${signalId}`);

  // 2. Update project
  if (signalId) {
    await updateProject(projectId, { signal_id: signalId, status: 'analyzing' });
  }

  // 3. Run POC Prepare Pipeline
  await log('[System] POC fast-track: running Knowledge Curator only...');
  const prepareResult = await runPreparePOC(description, {
    signalId,
    logger: log,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
    checkpoint,
    onCheckpoint,
  });

  if (signalId) {
    await updateSignalStatus(signalId, 'ANALYZED');
  }

  // 4. Store result — POC always PROCEEDs, clear checkpoint
  await updateProject(projectId, {
    prepare_result: { ...prepareResult, signalId },
    status: 'analyzing',
    pipeline_checkpoint: null,
  });

  await log(`[POC-Prepare] Complete. Decision: ${prepareResult.decision}`);
  return { ...prepareResult, signalId } as any;
}

export async function runProjectPlan(
  projectId: string,
  signalId: string,
  confirmedProposal: string,
  context: RunnerContext,
  checkpoint?: PipelineCheckpoint | null
): Promise<PlanResult> {
  const log = context.logger || console.log;

  const onCheckpoint = (cp: PipelineCheckpoint) => {
    updateProject(projectId, { pipeline_checkpoint: cp }).catch((err) =>
      console.error('[runner] Write plan checkpoint failed:', err)
    );
  };

  await log('[System] Initializing Planning pipeline...');
  const planResult = await runPlan(confirmedProposal, {
    signalId,
    logger: log,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
    checkpoint,
    onCheckpoint,
  });

  // Store result on project — clear checkpoint on success
  await updateProject(projectId, {
    plan_result: planResult,
    status: 'planned',
    pipeline_checkpoint: null,
  });

  messageBus.pipelineComplete(planResult);
  return planResult;
}
