import { createAnalystAgent } from '@/agents/analyst';
import { retrieveContext, storeDecision } from '@/lib/services/rag';
import { messageBus } from '@/connectors/bus/message-bus';
import type { PrepareResult, MRDDocument } from './prepare-pipeline';
import type { PipelineCheckpoint } from '@/projects/types';

interface POCPrepareContext {
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
  checkpoint?: PipelineCheckpoint | null;
  onCheckpoint?: (cp: PipelineCheckpoint) => void;
}

/**
 * POC Prepare Pipeline — Lightweight path for POC/Demo projects.
 *
 * Only runs Knowledge Curator to find reusable assets (code patterns,
 * past decisions, code artifacts), then auto-PROCEEDs.
 *
 * Skips Researcher, Blue Team, Red Team, and Arbitrator entirely —
 * POC/Demo projects have an implicit "go" decision from the client.
 */
export async function runPreparePOC(
  signalContent: string,
  context: POCPrepareContext = {}
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

  await trackLog('[POC-Prepare] POC/Demo fast-track: skipping Red/Blue Team, running Knowledge Curator only.');

  // --- 1. Gather RAG context (Knowledge Curator) ---
  let visionContext = intermediate.visionContext || '';
  let pastDecisions = intermediate.pastDecisions || '';
  let codePatterns = intermediate.codePatterns || '';
  let codeArtifacts = intermediate.codeArtifacts || '';

  if (!completedSteps.has('knowledge_curator')) {
    messageBus.agentStart('knowledge-curator', 1, 1);
    try {
      const curator = createAnalystAgent({ mode: 'retrieve' });
      const curatorResult = await curator.run(
        `请为以下 POC/Demo 需求检索可复用的上下文信息，重点关注：可复用的技术架构、代码模式、历史项目中的参考实现。\n\n${signalContent}`,
        agentCtx
      );
      if (curatorResult && typeof curatorResult === 'object') {
        visionContext = curatorResult.vision_context || '';
        pastDecisions = curatorResult.past_decisions || '';
        codePatterns = curatorResult.code_patterns || '';
        codeArtifacts = curatorResult.code_artifacts || '';
        await trackLog(`[POC-Prepare] Knowledge Curator completed (confidence: ${curatorResult.confidence || 'unknown'})`);
      }
      messageBus.agentComplete('knowledge-curator', curatorResult);
    } catch (e: any) {
      await trackLog(`[POC-Prepare] Knowledge Curator failed: ${e.message}. Falling back to basic retrieval.`);
      const ragContext = await retrieveContext(signalContent);
      visionContext = ragContext.visionContext;
      pastDecisions = ragContext.pastDecisions;
      messageBus.agentComplete('knowledge-curator', { fallback: true });
    }
    writeCheckpoint('knowledge_curator', { visionContext, pastDecisions, codePatterns, codeArtifacts });
  } else {
    await trackLog('[POC-Prepare] Skipping Knowledge Curator (resumed from checkpoint)');
  }

  // --- 2. Build reusable assets summary ---
  const reusableAssets: string[] = [];
  if (codePatterns) reusableAssets.push(`可复用代码模式:\n${codePatterns}`);
  if (codeArtifacts) reusableAssets.push(`可复用代码工件:\n${codeArtifacts}`);
  if (pastDecisions) reusableAssets.push(`相关历史决策:\n${pastDecisions}`);
  const assetsText = reusableAssets.length > 0
    ? reusableAssets.join('\n\n')
    : '未发现直接可复用的历史资产，需从零开始构建。';

  const summary = reusableAssets.length > 0
    ? `POC 快速通道：发现 ${reusableAssets.length} 类可复用资产，直接 PROCEED 进入实现阶段。`
    : 'POC 快速通道：无可复用资产，直接 PROCEED 进入实现阶段。';

  const businessVerdict = `POC/Demo 项目，客户已决定执行。${reusableAssets.length > 0 ? `Knowledge Curator 发现可复用资产，建议 Architect 优先利用。` : '建议 Architect 从需求出发快速设计实现方案。'}`;

  // --- 3. Store decision ---
  if (context.signalId) {
    await storeDecision(context.signalId, signalContent, 'POC Fast-Track: Auto-PROCEED', {
      decision: 'PROCEED',
      summary,
      business_verdict: businessVerdict,
      reusable_assets: assetsText,
    });
  }

  await trackLog(`[POC-Prepare] Auto-PROCEED. ${summary}`);
  messageBus.stageComplete('prepare', { decision: 'PROCEED' });

  // --- 4. Build PrepareResult (compatible with downstream) ---
  const defaultMrd: MRDDocument = {
    executive_pitch: signalContent,
    market_overview: { market_size: 'POC 阶段，市场验证留待后续', growth_trend: 'N/A', key_drivers: [] },
    target_personas: [],
    competitive_landscape: { key_players: [], our_differentiation: '', competitive_advantage: '' },
    roi_projection: { investment_estimate: 'POC 快速验证', expected_return: '演示效果验证', payback_period: 'N/A', confidence_level: 'medium' },
    market_timing: 'POC 阶段',
    success_metrics: ['核心演示场景端到端跑通', '示例数据可信且有说服力'],
  };

  return {
    decision: 'PROCEED',
    summary,
    blue_case: {
      proposal: signalContent,
      vision_alignment_score: 80,
      market_opportunity_score: 70,
      mrd: defaultMrd,
    },
    red_case: {
      critique: 'POC/Demo 项目，跳过风险审查。',
      risks: [],
    },
    arbitrator_rationale: 'POC/Demo 快速通道：客户已决定执行，自动放行。',
    business_verdict: businessVerdict,
    competitor_analysis: assetsText,
    logs,
  };
}
