import { z } from 'zod';
import { createAnalystAgent } from '@/agents/analyst';
import { retrieveContext, storeDecision } from '@/lib/services/rag';
import { messageBus } from '@/connectors/bus/message-bus';
import { getDefaultModel } from '@/connectors/external/openai';
import { isReasonerModel } from '@/lib/core/llm';
import { resolveRedTeamRuntime } from '@/lib/services/red-team-llm';

export interface MRDDocument {
  executive_pitch: string;
  market_overview: {
    market_size: string;
    growth_trend: string;
    key_drivers: string[];
  };
  target_personas: Array<{
    name: string;
    description: string;
    pain_points: string[];
    current_alternatives: string;
  }>;
  competitive_landscape: {
    key_players: string[];
    our_differentiation: string;
    competitive_advantage: string;
  };
  roi_projection: {
    investment_estimate: string;
    expected_return: string;
    payback_period: string;
    confidence_level: 'high' | 'medium' | 'low';
  };
  market_timing: string;
  success_metrics: string[];
}

export interface ROIChallenges {
  investment_reality_check: string;
  return_skepticism: string;
  hidden_costs: string[];
}

export interface PrepareResult {
  decision: 'PROCEED' | 'CIRCUIT_BREAK';
  summary: string;
  blue_case: {
    proposal: string;
    vision_alignment_score: number;
    market_opportunity_score: number;
    mrd: MRDDocument;
  };
  red_case: {
    critique: string;
    risks: string[];
    roi_challenges?: ROIChallenges;
    opportunity_cost?: string;
    market_risks?: string[];
  };
  arbitrator_rationale: string;
  business_verdict?: string;
  competitor_analysis?: string;
  logs?: string[];
}

interface PrepareContext {
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
  checkpoint?: import('@/projects/types').PipelineCheckpoint | null;
  onCheckpoint?: (cp: import('@/projects/types').PipelineCheckpoint) => void;
}

// ---------------------------------------------------------------------------
// Zod validation schemas for LLM outputs
// ---------------------------------------------------------------------------

const BlueTeamOutputSchema = z.object({
  proposal: z.string(),
  vision_alignment_score: z.number().min(0).max(100),
  market_opportunity_score: z.number().min(0).max(100),
  mrd: z.object({
    executive_pitch: z.string(),
    market_overview: z.object({
      market_size: z.string(),
      growth_trend: z.string(),
      key_drivers: z.array(z.string()),
    }),
    target_personas: z.array(z.object({
      name: z.string(),
      description: z.string(),
      pain_points: z.array(z.string()),
      current_alternatives: z.string(),
    })),
    competitive_landscape: z.object({
      key_players: z.array(z.string()),
      our_differentiation: z.string(),
      competitive_advantage: z.string(),
    }),
    roi_projection: z.object({
      investment_estimate: z.string(),
      expected_return: z.string(),
      payback_period: z.string(),
      confidence_level: z.enum(['high', 'medium', 'low']),
    }),
    market_timing: z.string(),
    success_metrics: z.array(z.string()),
  }),
});

const ArbitratorOutputSchema = z.object({
  decision: z.enum(['PROCEED', 'CIRCUIT_BREAK']),
  summary: z.string(),
  rationale: z.string(),
  business_verdict: z.string(),
});

/**
 * Prepare Pipeline — Circuit Breaker workflow using Agent Workspaces and Message Bus.
 *
 * Orchestrates: RAG Context → Researcher → Blue Team → Critic → Arbitrator
 */
export async function runPrepare(
  signalContent: string,
  context: PrepareContext = {}
): Promise<PrepareResult> {
  const log = context.logger || console.log;
  const logs: string[] = [];
  const trackLog = async (msg: string) => {
    logs.push(msg);
    await log(msg);
  };
  const agentCtx = {
    logger: trackLog,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
  };

  // Stage failure tracking for downstream data quality awareness
  const stageFailures: { stage: string; reason: string }[] = [];

  const defaultModel = getDefaultModel();
  const redTeamRuntime = resolveRedTeamRuntime(defaultModel);
  const redTeamModel = redTeamRuntime.model;

  // --- Checkpoint support ---
  const cp = context.checkpoint;
  const completedSteps = new Set(cp?.completed_steps || []);
  const intermediate: Record<string, any> = cp?.intermediate ? { ...cp.intermediate } : {};
  const started_at = cp?.started_at || new Date().toISOString();

  const writeCheckpoint = (stepName: string, data: Record<string, any>) => {
    completedSteps.add(stepName);
    Object.assign(intermediate, data);
    context.onCheckpoint?.({
      stage: 'prepare',
      completed_steps: [...completedSteps],
      intermediate: { ...intermediate },
      started_at,
      updated_at: new Date().toISOString(),
    });
  };

  await trackLog(`[Prepare] Config: Blue(${defaultModel}) vs Red(${redTeamRuntime.label})`);

  // Emit pipeline start
  messageBus.agentStart('researcher', 1, 6);

  // --- 1. Gather RAG context (Knowledge Curator with fallback) ---
  let visionContext = intermediate.visionContext || '';
  let pastDecisions = intermediate.pastDecisions || '';
  let codePatterns = intermediate.codePatterns || '';
  let codeArtifacts = intermediate.codeArtifacts || '';
  if (!completedSteps.has('knowledge_curator')) {
    try {
      const curator = createAnalystAgent({ mode: 'retrieve' });
      const curatorResult = await curator.run(
        `请为以下需求信号检索全面的上下文信息：\n\n${signalContent}`,
        agentCtx
      );
      if (curatorResult && typeof curatorResult === 'object') {
        visionContext = curatorResult.vision_context || '';
        pastDecisions = curatorResult.past_decisions || '';
        codePatterns = curatorResult.code_patterns || '';
        codeArtifacts = curatorResult.code_artifacts || '';
        await trackLog(`[Prepare] Knowledge Curator completed (confidence: ${curatorResult.confidence || 'unknown'})`);
      }
    } catch (e: any) {
      await trackLog(`[Prepare] Knowledge Curator failed: ${e.message}. Falling back to basic retrieval.`);
      stageFailures.push({ stage: 'Knowledge Curator', reason: e.message });
      const ragContext = await retrieveContext(signalContent);
      visionContext = ragContext.visionContext;
      pastDecisions = ragContext.pastDecisions;
    }
    writeCheckpoint('knowledge_curator', { visionContext, pastDecisions, codePatterns, codeArtifacts });
  } else {
    await trackLog('[Prepare] Skipping Knowledge Curator (resumed from checkpoint)');
  }

  // --- 2. Researcher agent (ReAct with web_search) ---
  let competitorContext: string = intermediate.competitorContext || '';
  if (!completedSteps.has('researcher')) {
    await trackLog('[Prepare] Running Researcher...');
    messageBus.agentStart('researcher', 1, 6);
    const researcher = createAnalystAgent({ mode: 'research', model: defaultModel });
    try {
      const researchResult = await researcher.run(
        `Idea: "${signalContent}"`,
        agentCtx
      );
      competitorContext = typeof researchResult === 'string'
        ? researchResult
        : JSON.stringify(researchResult);
      messageBus.agentComplete('researcher', researchResult);
    } catch (e: any) {
      await trackLog(`[Prepare] Researcher failed: ${e.message}. Continuing without market context.`);
      competitorContext = 'No market context available.';
      stageFailures.push({ stage: 'Researcher', reason: e.message });
    }
    writeCheckpoint('researcher', { competitorContext });
  } else {
    await trackLog('[Prepare] Skipping Researcher (resumed from checkpoint)');
  }

  // --- 3. Blue Team (full Agent with soul.md) ---
  let blueResult: any = intermediate.blueResult || null;
  if (!completedSteps.has('blue_team')) {
    await trackLog('[Prepare] Running Blue Team...');
    messageBus.agentStart('blue-team', 3, 6);
    const blueTeam = createAnalystAgent({ mode: 'advocate', model: defaultModel });

    // Inject data quality warning if Researcher failed
    const researcherWarning = stageFailures.some(f => f.stage === 'Researcher')
      ? '\n\n⚠️ 注意：市场调研数据获取失败，以上竞品/市场信息不完整。请在 MRD 中注明数据局限性，并适当降低 market_opportunity_score。'
      : '';

    try {
      blueResult = await blueTeam.runOnce(`
Raw Signal: "${signalContent}"
Vision Context: "${visionContext}"
Past Decisions: "${pastDecisions}"
Code Patterns: "${codePatterns}"
Competitor/Market Context: "${competitorContext}"

请基于以上信息撰写完整的 MRD（市场需求文档），用投资人路演的标准来论证为什么要做这个功能。${researcherWarning}
`, agentCtx);
    } catch (e: any) {
      await trackLog(`[Prepare] Blue Team failed: ${e.message}. Using fallback proposal.`);
      blueResult = {
        proposal: signalContent,
        vision_alignment_score: 0,
        rationale: 'Blue Team analysis failed, forwarding raw signal.',
      };
    }

    // Validate Blue Team output
    const blueValidation = BlueTeamOutputSchema.safeParse(blueResult);
    if (!blueValidation.success) {
      const issues = blueValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      await trackLog(`[Prepare] ⚠️ Blue Team output validation issues: ${issues}. Using raw output with fallback defaults.`);
      stageFailures.push({ stage: 'Blue Team (validation)', reason: issues });
    }

    await trackLog(`[BlueTeam] Proposal: ${blueResult.proposal?.slice(0, 80)}...`);
    messageBus.agentComplete('blue-team', blueResult);
    writeCheckpoint('blue_team', { blueResult });
  } else {
    await trackLog('[Prepare] Skipping Blue Team (resumed from checkpoint)');
  }

  // --- 4. Critic agent (ReAct with web_search, optionally using backup model) ---
  let redResult: any = intermediate.redResult || null;
  if (!completedSteps.has('red_team')) {
    await trackLog('[Prepare] Running Red Team...');
    messageBus.agentStart('critic', 4, 6);
    const critic = createAnalystAgent({
      mode: 'critique',
      model: redTeamModel,
      client: redTeamRuntime.client,
      poolTags: redTeamRuntime.poolTags,
      accountId: redTeamRuntime.accountId,
      accountName: redTeamRuntime.accountName,
    });

    // Reasoner models (e.g. deepseek-reasoner) don't support function calling,
    // so we fall back to runOnce (single-shot, no tools) for those models.
    const useReasonerFallback = isReasonerModel(redTeamModel);
    if (useReasonerFallback) {
      await trackLog(`[Prepare] Red Team model "${redTeamModel}" is a reasoner — using single-shot mode (no web search).`);
    }

    const criticPrompt = `
Blue Team Proposal: ${JSON.stringify(blueResult)}
Existing Context (Vision): "${visionContext}"
Past Decisions: "${pastDecisions}"
Code Patterns: "${codePatterns}"
Code Artifacts: "${codeArtifacts}"
Competitor/Market Context: "${competitorContext}"

请对这份 MRD 进行系统性风险审查：验证数据、质疑 ROI、分析机会成本、评估市场风险。
`;

    try {
      redResult = useReasonerFallback
        ? await critic.runOnce(criticPrompt, agentCtx)
        : await critic.run(criticPrompt, agentCtx);
      messageBus.agentComplete('critic', redResult);
    } catch (e: any) {
      await trackLog(`[Prepare] Red Team failed: ${e.message}. Using default critique.`);
      stageFailures.push({ stage: 'Red Team', reason: e.message });
      redResult = {
        critique: 'Red Team analysis inconclusive.',
        technical_risks: ['Analysis failed to converge'],
        commercial_flaws: [],
        fatal_flaw_detected: false,
      };
    }
    writeCheckpoint('red_team', { redResult });
  } else {
    await trackLog('[Prepare] Skipping Red Team (resumed from checkpoint)');
  }

  // --- 5. Arbitrator (full Agent with soul.md) ---
  await trackLog('[Prepare] Running Arbitrator...');
  messageBus.agentStart('arbitrator', 5, 6);
  const arbitrator = createAnalystAgent({ mode: 'arbitrate', model: defaultModel });

  // Inject data quality warnings so Arbitrator can factor in incompleteness
  const failureWarnings = stageFailures.length > 0
    ? `\n\n⚠️ 数据完整性警告：以下阶段执行失败，数据可能不完整：\n${stageFailures.map(f => `- ${f.stage}: ${f.reason}`).join('\n')}\n请在裁决时考虑数据缺失对置信度的影响，缺失关键数据时应倾向 CIRCUIT_BREAK。`
    : '';

  let arbitratorResult: any;
  try {
    arbitratorResult = await arbitrator.runOnce(`
Original Signal: "${signalContent}"

Blue Team (Pro): ${JSON.stringify(blueResult)}
Red Team (Con): ${JSON.stringify(redResult)}

请做出裁决，并给出一段面向决策者的商业价值总结（business_verdict）。${failureWarnings}
`, agentCtx);
  } catch (e: any) {
    await trackLog(`[Prepare] Arbitrator failed: ${e.message}. Defaulting to CIRCUIT_BREAK for safety.`);
    arbitratorResult = {
      decision: 'CIRCUIT_BREAK',
      summary: 'Arbitrator analysis failed — defaulting to rejection for safety.',
      rationale: `Arbitrator error: ${e.message}`,
    };
  }

  // Validate Arbitrator output
  const arbValidation = ArbitratorOutputSchema.safeParse(arbitratorResult);
  if (!arbValidation.success) {
    const issues = arbValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    await trackLog(`[Prepare] ⚠️ Arbitrator output validation issues: ${issues}. Defaulting to CIRCUIT_BREAK for safety.`);
    stageFailures.push({ stage: 'Arbitrator (validation)', reason: issues });
    // Safe default: override decision to CIRCUIT_BREAK when validation fails
    arbitratorResult = { ...arbitratorResult, decision: 'CIRCUIT_BREAK' };
  }

  await trackLog(`[Arbitrator] Ruling: ${arbitratorResult.decision}`);
  messageBus.agentComplete('arbitrator', arbitratorResult);
  messageBus.stageComplete('prepare', arbitratorResult);

  // --- 6. Side effect: store decision ---
  if (context.signalId) {
    const decisionText = arbitratorResult.decision === 'PROCEED'
      ? 'Proposal Approved by Circuit Breaker'
      : 'Proposal Rejected by Circuit Breaker';
    await storeDecision(context.signalId, signalContent, decisionText, {
      ...arbitratorResult,
      blue_case: blueResult,
      red_case: redResult,
    });
  }

  const defaultMrd: MRDDocument = {
    executive_pitch: '',
    market_overview: { market_size: '', growth_trend: '', key_drivers: [] },
    target_personas: [],
    competitive_landscape: { key_players: [], our_differentiation: '', competitive_advantage: '' },
    roi_projection: { investment_estimate: '', expected_return: '', payback_period: '', confidence_level: 'low' },
    market_timing: '',
    success_metrics: [],
  };

  const mrd: MRDDocument = {
    executive_pitch: blueResult.mrd?.executive_pitch || blueResult.proposal || '',
    market_overview: blueResult.mrd?.market_overview || defaultMrd.market_overview,
    target_personas: blueResult.mrd?.target_personas || defaultMrd.target_personas,
    competitive_landscape: blueResult.mrd?.competitive_landscape || defaultMrd.competitive_landscape,
    roi_projection: blueResult.mrd?.roi_projection || defaultMrd.roi_projection,
    market_timing: blueResult.mrd?.market_timing || '',
    success_metrics: blueResult.mrd?.success_metrics || [],
  };

  return {
    decision: arbitratorResult.decision as 'PROCEED' | 'CIRCUIT_BREAK',
    summary: arbitratorResult.summary || '',
    blue_case: {
      proposal: blueResult.proposal || '',
      vision_alignment_score: blueResult.vision_alignment_score || 0,
      market_opportunity_score: blueResult.market_opportunity_score || 0,
      mrd,
    },
    red_case: {
      critique: redResult.critique || '',
      risks: [
        ...(redResult.technical_risks || []),
        ...(redResult.commercial_flaws || []),
        ...(redResult.risks || []),
      ],
      roi_challenges: redResult.roi_challenges || undefined,
      opportunity_cost: redResult.opportunity_cost || undefined,
      market_risks: redResult.market_risks || undefined,
    },
    arbitrator_rationale: arbitratorResult.rationale || '',
    business_verdict: arbitratorResult.business_verdict || '',
    competitor_analysis: competitorContext,
    logs,
  };
}
