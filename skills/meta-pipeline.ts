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
 *
 * Three exported functions:
 *   - runDecisionPhase()   — DM only, returns DecisionOutput
 *   - runArchitectPhase()  — Architect only, returns ArchitectResult
 *   - runMetaPipeline()    — backward-compatible wrapper (DM → Architect)
 */

import { z } from 'zod';
import { createDecisionMakerAgent } from '@/agents/decision-maker';
import { createArchitectAgent } from '@/agents/architect';
import { removeDynamicAgent, getAllDynamicAgents } from '@/lib/tools/create-agent';
import { removeDynamicSkill, getAllDynamicSkills } from '@/lib/tools/create-skill';
import { messageBus } from '@/connectors/bus/message-bus';
import { emitWebhookEvent } from '@/lib/services/webhook';
import type { ArchitectResult, AgentContext, DecisionOutput, StructuredRequirements } from '@/lib/core/types';
import type { Blackboard } from '@/lib/blackboard/blackboard';

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
  /** Structured requirements from L3 clarification (injected into DM/Architect input). */
  structuredRequirements?: StructuredRequirements;
  /** Callback for tools that require human approval before execution. */
  onApprovalRequired?: AgentContext['onApprovalRequired'];
  /** Shared blackboard for cross-phase state persistence (DM → Architect). */
  blackboard?: Blackboard;
  /** Pre-seeded conversation history for resuming an incomplete Architect run. */
  initialMessages?: any[];
  /** Checkpoint callback — fired after each tool-call batch in the Architect ReAct loop. */
  onCheckpoint?: (data: { messages: any[]; stepsCompleted: number }) => void;
}

/**
 * Format StructuredRequirements into a markdown block for agent input injection.
 */
function formatStructuredRequirements(req: StructuredRequirements): string {
  const lines: string[] = ['\n\n---\n## Structured Requirements\n'];
  lines.push(`**Summary:** ${req.summary}\n`);
  if (req.goals.length > 0) {
    lines.push('### Goals');
    for (const g of req.goals) lines.push(`- ${g}`);
    lines.push('');
  }
  if (req.scope) {
    lines.push(`### Scope\n${req.scope}\n`);
  }
  if (req.constraints.length > 0) {
    lines.push('### Constraints');
    for (const c of req.constraints) lines.push(`- ${c}`);
    lines.push('');
  }
  lines.push('---');
  return lines.join('\n');
}

export interface MetaPipelineResult {
  decision?: DecisionOutput;
  architect?: ArchitectResult;
  skippedDecision: boolean;
}

// ---------------------------------------------------------------------------
// Phase 1: Decision Maker
// ---------------------------------------------------------------------------

/**
 * Run only the Decision Maker phase.
 * Returns a validated DecisionOutput (degrades to HALT on validation failure).
 */
export async function runDecisionPhase(
  input: string | string[],
  options: MetaPipelineOptions = {},
): Promise<DecisionOutput> {
  const log = options.logger || console.log;

  const inputMessage = Array.isArray(input)
    ? `以下是批量信号/需求，请先聚合再决策:\n\n${input.map((s, i) => `[信号 ${i + 1}] ${s}`).join('\n\n')}`
    : input;

  const agentCtx = {
    projectId: options.projectId,
    recordUsage: options.recordUsage,
  };

  await log('[Meta] Starting Decision Maker...');

  // Seed pipeline requirements to blackboard before DM runs
  if (options.blackboard) {
    await options.blackboard.write({
      key: 'pipeline.requirements',
      value: {
        input: inputMessage,
        structuredRequirements: options.structuredRequirements ?? null,
        signalIds: options.signalIds ?? [],
      },
      type: 'context',
      author: 'meta-pipeline',
      tags: ['pipeline', 'requirements'],
    });
  }

  const dm = createDecisionMakerAgent({ blackboard: options.blackboard });
  const dmContext = options.signalIds
    ? `\n\n关联信号 IDs: ${options.signalIds.join(', ')}`
    : '';

  const reqContext = options.structuredRequirements
    ? formatStructuredRequirements(options.structuredRequirements)
    : '';

  let dmResult: any;
  try {
    dmResult = await dm.run(inputMessage + dmContext + reqContext, {
      logger: messageBus.createLogger('decision-maker'),
      ...agentCtx,
    });
  } catch (err: any) {
    await log(`[Meta] DM agent.run() failed: ${err.message}`);
    return {
      decision: 'HALT',
      confidence: 0,
      summary: `DM error: ${err.message}`,
      rationale: `DM agent threw an exception: ${err.message}`,
      risk_level: 'critical',
      risk_factors: ['DM agent runtime failure'],
      sources: [],
      recommended_actions: ['Review DM agent configuration and retry'],
    } as DecisionOutput;
  }

  // Validate DM output with Zod — safe degradation on failure
  const dmValidation = DecisionOutputSchema.safeParse(dmResult);
  let decision: DecisionOutput;

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

  // Write full decision to blackboard (fire-and-forget)
  if (options.blackboard) {
    options.blackboard.write({
      key: 'dm.decision',
      value: decision,
      type: 'decision',
      author: 'decision_maker',
      tags: ['dm', 'decision', decision.decision.toLowerCase()],
    }).catch(err => console.error('[Meta] Blackboard dm.decision write failed:', err));
  }

  return decision;
}

// ---------------------------------------------------------------------------
// Phase 2: Architect
// ---------------------------------------------------------------------------

/**
 * Run only the Architect phase (+ cleanup).
 * Expects a pre-validated DecisionOutput (or undefined when decision was skipped).
 */
export async function runArchitectPhase(
  input: string | string[],
  decision: DecisionOutput | undefined,
  options: MetaPipelineOptions = {},
): Promise<ArchitectResult> {
  const log = options.logger || console.log;

  const inputMessage = Array.isArray(input)
    ? `以下是批量信号/需求，请先聚合再决策:\n\n${input.map((s, i) => `[信号 ${i + 1}] ${s}`).join('\n\n')}`
    : input;

  const agentCtx = {
    projectId: options.projectId,
    recordUsage: options.recordUsage,
  };

  await log('[Meta] Starting Architect...');

  const reqContext = options.structuredRequirements
    ? formatStructuredRequirements(options.structuredRequirements)
    : '';

  let architectInput: string;
  if (options.blackboard && options.blackboard.size > 0) {
    const bbContext = options.blackboard.toContextString();
    architectInput = decision
      ? `决策者已批准以下需求 (confidence: ${decision.confidence}):\n\n## Blackboard Context\n${bbContext}\n\n原始需求:\n${inputMessage}${reqContext}`
      : `${inputMessage}${reqContext}\n\n## Blackboard Context\n${bbContext}`;
  } else {
    architectInput = decision
      ? `决策者已批准以下需求 (confidence: ${decision.confidence}):\n\n${decision.summary}\n\n推荐行动:\n${decision.recommended_actions?.join('\n') || 'N/A'}\n\n原始需求:\n${inputMessage}${reqContext}`
      : `${inputMessage}${reqContext}`;
  }

  const architect = createArchitectAgent({
    context: architectInput,
    onApprovalRequired: options.onApprovalRequired,
    blackboard: options.blackboard,
    initialMessages: options.initialMessages,
  });

  const rawArchitectResult = await architect.run(architectInput, {
    logger: messageBus.createLogger('architect'),
    onApprovalRequired: options.onApprovalRequired,
    onCheckpoint: options.onCheckpoint,
    ...agentCtx,
  });

  // Validate Architect output with Zod — safe defaults on failure
  let architectResult: ArchitectResult;
  const acValidation = ArchitectResultSchema.safeParse(rawArchitectResult);
  if (acValidation.success) {
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

  // --- Cleanup dynamic agents/skills ---
  const createdAgents = architectResult.created_agents || [];
  const createdSkills = architectResult.created_skills || [];

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

  return architectResult;
}

// ---------------------------------------------------------------------------
// Full pipeline (backward-compatible wrapper)
// ---------------------------------------------------------------------------

/**
 * Run the full meta pipeline: Decision Maker → Architect.
 * Backward-compatible — callers (cron, meta API) continue to work unchanged.
 *
 * @param input - Single requirement string or array of signal descriptions for batch processing
 * @param options - Pipeline configuration
 */
export async function runMetaPipeline(
  input: string | string[],
  options: MetaPipelineOptions = {}
): Promise<MetaPipelineResult> {
  const log = options.logger || console.log;

  // Publish pipeline start
  messageBus.publish({
    from: 'meta-pipeline',
    channel: 'meta-pipeline',
    type: 'agent_start',
    payload: { input: typeof input === 'string' ? input.slice(0, 200) : `${input.length} signals` },
  });

  emitWebhookEvent({
    event: 'pipeline_started',
    title: 'Pipeline Started',
    detail: `Pipeline started for: ${typeof input === 'string' ? input.slice(0, 200) : `${input.length} signals`}`,
    from: 'meta-pipeline',
  });

  let decision: DecisionOutput | undefined;

  // --- Phase 1: Decision Maker ---
  if (!options.skipDecision) {
    decision = await runDecisionPhase(input, options);

    if (decision.decision !== 'PROCEED') {
      await log(`[Meta] Pipeline stopped. Decision: ${decision.decision}. Rationale: ${decision.rationale}`);

      messageBus.publish({
        from: 'meta-pipeline',
        channel: 'meta-pipeline',
        type: 'pipeline_complete',
        payload: { decision: decision.decision },
      });

      emitWebhookEvent({
        event: 'pipeline_complete',
        title: `Pipeline Stopped: ${decision.decision}`,
        detail: decision.rationale,
        from: 'meta-pipeline',
      });

      return { decision, skippedDecision: false };
    }
  } else {
    await log('[Meta] Decision Maker skipped (skipDecision=true)');
  }

  // --- Phase 2: Architect ---
  const architectResult = await runArchitectPhase(input, decision, options);

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

  emitWebhookEvent({
    event: 'pipeline_complete',
    title: 'Pipeline Complete',
    detail: `Steps: ${architectResult.steps_completed} completed, ${architectResult.steps_failed} failed`,
    from: 'meta-pipeline',
  });

  return {
    decision,
    architect: architectResult,
    skippedDecision: !!options.skipDecision,
  };
}
