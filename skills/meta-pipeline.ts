/**
 * Meta Pipeline — orchestrates Decision Maker → Architect → cleanup.
 *
 * This is the top-level entry point for the meta-agent system.
 * It replaces the fixed Prepare → Plan → Implement pipeline with
 * an adaptive approach driven by three meta-level agents.
 *
 * Dual entry:
 *   1. Automated: signals from YouTube/Reddit/Twitter → cron → here
 *   2. Manual: user submits requirement directly → here
 */

import { z } from 'zod';
import { createDecisionMakerAgent } from '@/agents/decision-maker';
import { createArchitectAgent } from '@/agents/architect';
import { removeDynamicAgent, getAllDynamicAgents } from '@/lib/tools/create-agent';
import { removeDynamicSkill, getAllDynamicSkills } from '@/lib/tools/create-skill';
import { messageBus } from '@/connectors/bus/message-bus';
import type { ArchitectResult, DecisionOutput } from '@/lib/core/types';

// ---------------------------------------------------------------------------
// Zod schemas for runtime validation of agent outputs.
// Aligned with exit tool schemas (finish-decision.ts, finish-architect.ts).
// ---------------------------------------------------------------------------

const DecisionSourceSchema = z.object({
  type: z.enum(['rag', 'agent', 'user', 'external']),
  name: z.string(),
  summary: z.string(),
  confidence: z.number(),
});

const DecisionOutputSchema = z.object({
  decision: z.enum(['PROCEED', 'HALT', 'DEFER', 'ESCALATE']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  rationale: z.string(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  risk_factors: z.array(z.string()),
  sources: z.array(DecisionSourceSchema),
  recommended_actions: z.array(z.string()),
  aggregated_signals: z.array(z.string()).optional(),
});

const ArchitectResultSchema = z.object({
  summary: z.string(),
  execution_trace: z.array(z.object({
    step_id: z.string(),
    action: z.string(),
    agent_or_tool: z.string(),
    status: z.string(),
    output_summary: z.string(),
  })),
  final_output: z.any(),
  steps_completed: z.number(),
  steps_failed: z.number(),
  steps_retried: z.number(),
  created_agents: z.array(z.string()).optional(),
  created_skills: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export interface MetaPipelineOptions {
  projectId?: string;
  repoUrl?: string;
  /** Skip decision-maker and go directly to architect */
  skipDecision?: boolean;
  /** Signal IDs associated with this run (for batch processing) */
  signalIds?: string[];
  /** Logger for SSE streaming */
  logger?: (msg: string) => Promise<void> | void;
  /** Token usage recording callback */
  recordUsage?: (params: {
    agentName: string;
    projectId?: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => void;
}

export interface MetaPipelineResult {
  decision?: DecisionOutput;
  architect?: ArchitectResult;
  skippedDecision: boolean;
}

/**
 * Run the full meta pipeline: Decision Maker → Architect.
 *
 * @param input - Single requirement string or array of signal descriptions for batch processing
 * @param options - Pipeline configuration
 */
export async function runMetaPipeline(
  input: string | string[],
  options: MetaPipelineOptions = {}
): Promise<MetaPipelineResult> {
  const log = options.logger || console.log;

  // Normalize input
  const inputMessage = Array.isArray(input)
    ? `以下是批量信号/需求，请先聚合再决策:\n\n${input.map((s, i) => `[信号 ${i + 1}] ${s}`).join('\n\n')}`
    : input;

  // Publish pipeline start
  messageBus.publish({
    from: 'meta-pipeline',
    channel: 'meta-pipeline',
    type: 'agent_start',
    payload: { input: typeof input === 'string' ? input.slice(0, 200) : `${input.length} signals` },
  });

  const agentCtx = {
    projectId: options.projectId,
    recordUsage: options.recordUsage,
  };

  let decision: DecisionOutput | undefined;

  // --- Phase 1: Decision Maker ---
  if (!options.skipDecision) {
    await log('[Meta] Starting Decision Maker...');

    const dm = createDecisionMakerAgent();
    const dmContext = options.signalIds
      ? `\n\n关联信号 IDs: ${options.signalIds.join(', ')}`
      : '';

    const dmResult = await dm.run(inputMessage + dmContext, {
      logger: messageBus.createLogger('decision-maker'),
      ...agentCtx,
    });

    // Validate DM output with Zod — safe degradation on failure
    const dmValidation = DecisionOutputSchema.safeParse(dmResult);
    if (dmValidation.success) {
      decision = dmValidation.data as DecisionOutput;
    } else {
      const issues = dmValidation.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      await log(`[Meta] ⚠️ Decision Maker output validation failed: ${issues}. Degrading to HALT.`);
      decision = {
        decision: 'HALT',
        confidence: 0,
        summary: dmResult?.summary || 'Decision output validation failed.',
        rationale: `Validation errors: ${issues}`,
        risk_level: 'critical',
        risk_factors: ['Agent output did not match expected schema'],
        sources: [],
        recommended_actions: ['Review agent output and retry'],
        aggregated_signals: dmResult?.aggregated_signals,
      };
    }

    await log(`[Meta] Decision: ${decision.decision} (confidence: ${decision.confidence})`);

    if (decision.decision !== 'PROCEED') {
      await log(`[Meta] Pipeline stopped. Decision: ${decision.decision}. Rationale: ${decision.rationale}`);

      messageBus.publish({
        from: 'meta-pipeline',
        channel: 'meta-pipeline',
        type: 'pipeline_complete',
        payload: { decision: decision.decision },
      });

      return { decision, skippedDecision: false };
    }
  } else {
    await log('[Meta] Decision Maker skipped (skipDecision=true)');
  }

  // --- Phase 2: Architect ---
  await log('[Meta] Starting Architect...');

  const architectInput = decision
    ? `决策者已批准以下需求 (confidence: ${decision.confidence}):\n\n${decision.summary}\n\n推荐行动:\n${decision.recommended_actions?.join('\n') || 'N/A'}\n\n原始需求:\n${inputMessage}`
    : inputMessage;

  const architect = createArchitectAgent({
    context: architectInput,
  });

  const rawArchitectResult = await architect.run(architectInput, {
    logger: messageBus.createLogger('architect'),
    ...agentCtx,
  });

  // Validate Architect output with Zod — safe defaults on failure
  let architectResult: ArchitectResult;
  const acValidation = ArchitectResultSchema.safeParse(rawArchitectResult);
  if (acValidation.success) {
    // Zod schema validates structure; cast via unknown because execution_trace
    // step fields (action union, retry_count) are looser in the exit tool schema.
    architectResult = acValidation.data as unknown as ArchitectResult;
  } else {
    const issues = acValidation.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    await log(`[Meta] ⚠️ Architect output validation failed: ${issues}. Using safe defaults.`);
    architectResult = {
      summary: rawArchitectResult?.summary || 'Architect output validation failed.',
      execution_trace: rawArchitectResult?.execution_trace || [],
      final_output: rawArchitectResult?.final_output || null,
      steps_completed: rawArchitectResult?.steps_completed ?? 0,
      steps_failed: rawArchitectResult?.steps_failed ?? 0,
      steps_retried: rawArchitectResult?.steps_retried ?? 0,
      created_agents: rawArchitectResult?.created_agents || [],
      created_skills: rawArchitectResult?.created_skills || [],
    };
  }

  await log(`[Meta] Architect complete. Steps: ${architectResult.steps_completed} completed, ${architectResult.steps_failed} failed, ${architectResult.steps_retried} retried`);

  // --- Phase 3: Cleanup dynamic agents/skills ---
  const createdAgents = architectResult.created_agents || [];
  const createdSkills = architectResult.created_skills || [];

  // Only cleanup non-persistent ones
  const dynamicAgents = getAllDynamicAgents();
  const dynamicSkills = getAllDynamicSkills();

  let cleanedAgents = 0;
  let cleanedSkills = 0;

  for (const agent of dynamicAgents) {
    if (!agent.persistent && createdAgents.includes(agent.id)) {
      removeDynamicAgent(agent.id);
      cleanedAgents++;
    }
  }

  for (const skill of dynamicSkills) {
    if (!skill.persistent && createdSkills.includes(skill.id)) {
      removeDynamicSkill(skill.id);
      cleanedSkills++;
    }
  }

  if (cleanedAgents > 0 || cleanedSkills > 0) {
    await log(`[Meta] Cleanup: ${cleanedAgents} temp agents, ${cleanedSkills} temp skills removed`);
  }

  // Publish pipeline complete
  messageBus.publish({
    from: 'meta-pipeline',
    channel: 'meta-pipeline',
    type: 'pipeline_complete',
    payload: {
      decision: decision?.decision || 'SKIPPED',
      stepsCompleted: architectResult.steps_completed,
      stepsFailed: architectResult.steps_failed,
    },
  });

  return {
    decision,
    architect: architectResult,
    skippedDecision: !!options.skipDecision,
  };
}
