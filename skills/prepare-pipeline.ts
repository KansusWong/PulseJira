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
}

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

  const defaultModel = getDefaultModel();
  const redTeamRuntime = resolveRedTeamRuntime(defaultModel);
  const redTeamModel = redTeamRuntime.model;

  await trackLog(`[Prepare] Config: Blue(${defaultModel}) vs Red(${redTeamRuntime.label})`);

  // Emit pipeline start
  messageBus.agentStart('researcher', 1, 6);

  // --- 1. Gather RAG context (Knowledge Curator with fallback) ---
  let visionContext = '';
  let pastDecisions = '';
  let codePatterns = '';
  let codeArtifacts = '';
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
    const ragContext = await retrieveContext(signalContent);
    visionContext = ragContext.visionContext;
    pastDecisions = ragContext.pastDecisions;
  }

  // --- 2. Researcher agent (ReAct with web_search) ---
  await trackLog('[Prepare] Running Researcher...');
  messageBus.agentStart('researcher', 1, 6);
  const researcher = createAnalystAgent({ mode: 'research', model: defaultModel });
  let competitorContext: string;
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
  }

  // --- 3. Blue Team (full Agent with soul.md) ---
  await trackLog('[Prepare] Running Blue Team...');
  messageBus.agentStart('blue-team', 3, 6);
  const blueTeam = createAnalystAgent({ mode: 'advocate', model: defaultModel });
  let blueResult: any;
  try {
    blueResult = await blueTeam.runOnce(`
Raw Signal: "${signalContent}"
Vision Context: "${visionContext}"
Past Decisions: "${pastDecisions}"
Code Patterns: "${codePatterns}"
Competitor/Market Context: "${competitorContext}"

请基于以上信息撰写完整的 MRD（市场需求文档），用投资人路演的标准来论证为什么要做这个功能。
`, agentCtx);
  } catch (e: any) {
    await trackLog(`[Prepare] Blue Team failed: ${e.message}. Using fallback proposal.`);
    blueResult = {
      proposal: signalContent,
      vision_alignment_score: 0,
      rationale: 'Blue Team analysis failed, forwarding raw signal.',
    };
  }

  await trackLog(`[BlueTeam] Proposal: ${blueResult.proposal?.slice(0, 80)}...`);
  messageBus.agentComplete('blue-team', blueResult);

  // --- 4. Critic agent (ReAct with web_search, optionally using backup model) ---
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

  let redResult: any;
  try {
    redResult = useReasonerFallback
      ? await critic.runOnce(criticPrompt, agentCtx)
      : await critic.run(criticPrompt, agentCtx);
    messageBus.agentComplete('critic', redResult);
  } catch (e: any) {
    await trackLog(`[Prepare] Red Team failed: ${e.message}. Using default critique.`);
    redResult = {
      critique: 'Red Team analysis inconclusive.',
      technical_risks: ['Analysis failed to converge'],
      commercial_flaws: [],
      fatal_flaw_detected: false,
    };
  }

  // --- 5. Arbitrator (full Agent with soul.md) ---
  await trackLog('[Prepare] Running Arbitrator...');
  messageBus.agentStart('arbitrator', 5, 6);
  const arbitrator = createAnalystAgent({ mode: 'arbitrate', model: defaultModel });
  let arbitratorResult: any;
  try {
    arbitratorResult = await arbitrator.runOnce(`
Original Signal: "${signalContent}"

Blue Team (Pro): ${JSON.stringify(blueResult)}
Red Team (Con): ${JSON.stringify(redResult)}

请做出裁决，并给出一段面向决策者的商业价值总结（business_verdict）。
`, agentCtx);
  } catch (e: any) {
    await trackLog(`[Prepare] Arbitrator failed: ${e.message}. Defaulting to CIRCUIT_BREAK for safety.`);
    arbitratorResult = {
      decision: 'CIRCUIT_BREAK',
      summary: 'Arbitrator analysis failed — defaulting to rejection for safety.',
      rationale: `Arbitrator error: ${e.message}`,
    };
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
