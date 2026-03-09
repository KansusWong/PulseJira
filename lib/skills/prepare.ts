import { z } from 'zod';
import { createAnalystAgent } from '@/agents/analyst';
import { generateJSON } from '../core/llm';
import { retrieveContext, storeDecision } from '../services/rag';
import { getAnalystPrompt } from '@/agents/analyst/prompts/system';
import { resolveRedTeamRuntime } from '../services/red-team-llm';

// ---------------------------------------------------------------------------
// MRD Sub-types
// ---------------------------------------------------------------------------

export interface MRDMarketOverview {
  market_size: string;
  growth_trend: string;
  key_drivers: string[];
}

export interface MRDPersona {
  name: string;
  description: string;
  pain_points: string[];
  current_alternatives: string;
}

export interface MRDCompetitiveLandscape {
  key_players: string[];
  our_differentiation: string;
  competitive_advantage: string;
}

export interface MRDROIProjection {
  investment_estimate: string;
  expected_return: string;
  payback_period: string;
  confidence_level: 'high' | 'medium' | 'low';
}

export interface MRDDocument {
  executive_pitch: string;
  market_overview: MRDMarketOverview;
  target_personas: MRDPersona[];
  competitive_landscape: MRDCompetitiveLandscape;
  roi_projection: MRDROIProjection;
  market_timing: string;
  success_metrics: string[];
}

export interface ROIChallenges {
  investment_reality_check: string;
  return_skepticism: string;
  hidden_costs: string[];
}

// ---------------------------------------------------------------------------
// PrepareResult
// ---------------------------------------------------------------------------

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
  signalId?: string;
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
}

// ---------------------------------------------------------------------------
// Default MRD (fallback when parsing fails)
// ---------------------------------------------------------------------------

const DEFAULT_MRD: MRDDocument = {
  executive_pitch: '',
  market_overview: { market_size: '', growth_trend: '', key_drivers: [] },
  target_personas: [],
  competitive_landscape: { key_players: [], our_differentiation: '', competitive_advantage: '' },
  roi_projection: { investment_estimate: '', expected_return: '', payback_period: '', confidence_level: 'low' },
  market_timing: '',
  success_metrics: [],
};

// ---------------------------------------------------------------------------
// Zod validation schemas for LLM outputs (#10)
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
 * Prepare Skill — Circuit Breaker workflow.
 *
 * Orchestrates: RAG Context → Researcher → Blue Team(MRD) → Critic(Risk Audit) → Arbitrator
 *
 * Decides whether an idea should proceed to PRD generation or be stopped.
 * Now produces a full MRD and deep risk analysis for display in the workspace.
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

  // Stage failure tracking for downstream data quality awareness (#11)
  const stageFailures: { stage: string; reason: string }[] = [];

  // --- Configure models ---
  const defaultModel = process.env.LLM_MODEL_NAME || 'gpt-4o';
  const redTeamRuntime = resolveRedTeamRuntime(defaultModel);
  await trackLog(`[Prepare] Config: Blue(${defaultModel}) vs Red(${redTeamRuntime.label})`);

  const agentCtx = {
    logger: trackLog,
    projectId: context.projectId,
    recordUsage: context.recordUsage,
  };

  const makeOnUsage = (agentName: string) =>
    context.recordUsage
      ? (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string }) => {
          context.recordUsage!({
            agentName,
            projectId: context.projectId,
            model: usage.model,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          });
        }
      : undefined;

  // --- 1. Gather RAG context ---
  const ragContext = await retrieveContext(signalContent);
  const visionContext = ragContext.visionContext;

  // --- 2. Researcher agent (ReAct with web_search) ---
  await trackLog('[Prepare] Running Researcher...');
  const researcher = createAnalystAgent({ mode: 'research', model: defaultModel });
  let competitorContext: string;
  try {
    const researchResult = await researcher.run(
      `Idea: "${signalContent}"`,
      agentCtx,
    );
    competitorContext = typeof researchResult === 'string'
      ? researchResult
      : JSON.stringify(researchResult);
  } catch (e: any) {
    await trackLog(`[Prepare] ⚠️ Researcher failed: ${e.message}. Continuing without market context.`);
    competitorContext = 'No market context available.';
    stageFailures.push({ stage: 'Researcher', reason: e.message });
  }

  // --- 3. Blue Team — MRD generation (single LLM call) ---
  await trackLog('[Prepare] Running Blue Team (MRD generation)...');

  // Inject data quality warning if Researcher failed (#11)
  const researcherWarning = stageFailures.some(f => f.stage === 'Researcher')
    ? '\n\n⚠️ 注意：市场调研数据获取失败，以上竞品/市场信息不完整。请在 MRD 中注明数据局限性，并适当降低 market_opportunity_score。'
    : '';

  const rawBlueResult = await generateJSON(getAnalystPrompt('advocate'), `
Raw Signal: "${signalContent}"
Vision Context: "${visionContext}"
Competitor/Market Context: "${competitorContext}"

请基于以上信息撰写完整的 MRD（市场需求文档），用投资人路演的标准来论证为什么要做这个功能。${researcherWarning}
`, { model: defaultModel, agentName: 'blue-team', projectId: context.projectId, onUsage: makeOnUsage('blue-team') });

  // Validate Blue Team output (#10)
  const blueValidation = BlueTeamOutputSchema.safeParse(rawBlueResult);
  if (!blueValidation.success) {
    const issues = blueValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    await trackLog(`[Prepare] ⚠️ Blue Team output validation issues: ${issues}. Using raw output with fallback defaults.`);
    stageFailures.push({ stage: 'Blue Team (validation)', reason: issues });
  }
  const blueResult = rawBlueResult;

  await trackLog(`[BlueTeam] MRD generated. Vision: ${blueResult.vision_alignment_score ?? 'N/A'}, Market: ${blueResult.market_opportunity_score ?? 'N/A'}`);

  // --- 4. Critic agent — Deep risk audit (ReAct with web_search) ---
  await trackLog('[Prepare] Running Red Team (Risk Audit)...');
  const critic = createAnalystAgent({
    mode: 'critique',
    model: redTeamRuntime.model,
    client: redTeamRuntime.client,
    poolTags: redTeamRuntime.poolTags,
    accountId: redTeamRuntime.accountId,
    accountName: redTeamRuntime.accountName,
  });

  let redResult: any;
  try {
    redResult = await critic.run(`
Blue Team 提案与 MRD: ${JSON.stringify(blueResult)}
Existing Context (Vision): "${visionContext}"
Competitor/Market Context: "${competitorContext}"

请对这份 MRD 进行系统性风险审查：验证数据、质疑 ROI、分析机会成本、评估市场风险。
`, agentCtx);
  } catch (e: any) {
    await trackLog(`[Prepare] ⚠️ Red Team failed: ${e.message}. Using default critique.`);
    stageFailures.push({ stage: 'Red Team', reason: e.message });
    redResult = {
      critique: 'Red Team analysis inconclusive.',
      technical_risks: ['Analysis failed to converge'],
      commercial_flaws: [],
      roi_challenges: {
        investment_reality_check: 'Unable to verify',
        return_skepticism: 'Unable to verify',
        hidden_costs: [],
      },
      opportunity_cost: 'Unable to assess',
      market_risks: [],
      fatal_flaw_detected: false,
    };
  }

  // --- 5. Arbitrator — Ruling with business verdict (single LLM call) ---
  await trackLog('[Prepare] Running Arbitrator...');

  // Inject data quality warnings so Arbitrator can factor in incompleteness (#11)
  const failureWarnings = stageFailures.length > 0
    ? `\n\n⚠️ 数据完整性警告：以下阶段执行失败，数据可能不完整：\n${stageFailures.map(f => `- ${f.stage}: ${f.reason}`).join('\n')}\n请在裁决时考虑数据缺失对置信度的影响，缺失关键数据时应倾向 CIRCUIT_BREAK。`
    : '';

  const rawArbitratorResult = await generateJSON(getAnalystPrompt('arbitrate'), `
Original Signal: "${signalContent}"

Blue Team MRD (Pro): ${JSON.stringify(blueResult)}
Red Team Risk Audit (Con): ${JSON.stringify(redResult)}

请做出裁决，并给出一段面向决策者的商业价值总结（business_verdict）。${failureWarnings}
`, { model: defaultModel, agentName: 'arbitrator', projectId: context.projectId, onUsage: makeOnUsage('arbitrator') });

  // Validate Arbitrator output (#10)
  const arbValidation = ArbitratorOutputSchema.safeParse(rawArbitratorResult);
  if (!arbValidation.success) {
    const issues = arbValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    await trackLog(`[Prepare] ⚠️ Arbitrator output validation issues: ${issues}. Defaulting to CIRCUIT_BREAK for safety.`);
    stageFailures.push({ stage: 'Arbitrator (validation)', reason: issues });
  }

  // Use validated decision or default to CIRCUIT_BREAK when validation fails (safe default)
  const arbitratorResult = {
    ...rawArbitratorResult,
    decision: arbValidation.success ? arbValidation.data.decision : 'CIRCUIT_BREAK',
  };

  await trackLog(`[Arbitrator] Ruling: ${arbitratorResult.decision} | Verdict: ${(arbitratorResult.business_verdict || '').slice(0, 60)}...`);

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

  // --- 7. Build MRD from blue result (with safe fallbacks) ---
  const mrd: MRDDocument = {
    executive_pitch: blueResult.mrd?.executive_pitch || blueResult.proposal || '',
    market_overview: blueResult.mrd?.market_overview || DEFAULT_MRD.market_overview,
    target_personas: blueResult.mrd?.target_personas || DEFAULT_MRD.target_personas,
    competitive_landscape: blueResult.mrd?.competitive_landscape || DEFAULT_MRD.competitive_landscape,
    roi_projection: blueResult.mrd?.roi_projection || DEFAULT_MRD.roi_projection,
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
    signalId: context.signalId,
  };
}
