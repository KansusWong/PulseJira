import { runPrepare, type PrepareResult } from './prepare-pipeline';
import { runPlan, type PlanResult } from './plan-pipeline';
import { messageBus } from '@/connectors/bus/message-bus';

export interface FullPipelineResult {
  prepare: PrepareResult;
  plan?: PlanResult;
}

/**
 * Full Pipeline — End-to-end: Prepare (circuit breaker) → Plan (PRD + tasks).
 * Only runs Plan if Prepare returns PROCEED.
 */
export async function runFullPipeline(
  signalContent: string,
  context: { signalId?: string; logger?: (msg: string) => Promise<void> | void } = {}
): Promise<FullPipelineResult> {
  const log = context.logger || console.log;

  // Phase 1: Prepare
  const prepareResult = await runPrepare(signalContent, context);

  if (prepareResult.decision !== 'PROCEED') {
    await log('[Pipeline] Circuit breaker triggered. Stopping.');
    messageBus.pipelineComplete({ prepare: prepareResult });
    return { prepare: prepareResult };
  }

  // Phase 2: Plan — pass MRD context for richer PRD generation
  const mrdPitch = prepareResult.blue_case.mrd?.executive_pitch || '';
  const confirmedProposal = [
    prepareResult.blue_case.proposal ? `Proposal: ${prepareResult.blue_case.proposal}` : '',
    mrdPitch ? `\nMRD Executive Pitch: ${mrdPitch}` : '',
    prepareResult.arbitrator_rationale ? `\nArbitrator Rationale: ${prepareResult.arbitrator_rationale}` : '',
    prepareResult.business_verdict ? `\nBusiness Verdict: ${prepareResult.business_verdict}` : '',
  ].filter(Boolean).join('\n') || signalContent;

  const planResult = await runPlan(confirmedProposal, context);

  messageBus.pipelineComplete({ prepare: prepareResult, plan: planResult });

  return {
    prepare: prepareResult,
    plan: planResult,
  };
}
