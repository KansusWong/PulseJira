import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const SourceSchema = z.object({
  type: z.enum(['rag', 'agent', 'user', 'external']),
  name: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
});

const FinishDecisionInputSchema = z.object({
  decision: z.enum(['PROCEED', 'HALT', 'DEFER', 'ESCALATE']).describe(
    'Final decision: PROCEED (≥0.7 confidence), HALT (fundamental flaw), DEFER (need more info), ESCALATE (needs human)'
  ),
  confidence: z.number().min(0).max(1).describe('Decision confidence score'),
  summary: z.string().describe('Brief decision summary'),
  rationale: z.string().describe('Detailed reasoning behind the decision'),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).describe('Overall risk level'),
  risk_factors: z.array(z.string()).describe('Identified risk factors'),
  sources: z.array(SourceSchema).describe('Evidence sources used in decision-making'),
  recommended_actions: z.array(z.string()).describe('Recommended next steps'),
  aggregated_signals: z.array(z.string()).optional().describe('Signal IDs aggregated into this decision (batch mode)'),
});

export type FinishDecisionInput = z.infer<typeof FinishDecisionInputSchema>;

/**
 * Exit signal tool for the Decision Maker agent.
 * When called, the ReAct loop terminates and returns the structured decision.
 */
export class FinishDecisionTool extends BaseTool<FinishDecisionInput, FinishDecisionInput> {
  name = 'finish_decision';
  description = '提交最终决策并退出决策循环。决策必须包含置信度评分、风险评估和证据来源。仅在收集到足够证据后调用。';
  schema = FinishDecisionInputSchema;

  protected async _run(input: FinishDecisionInput): Promise<FinishDecisionInput> {
    return input;
  }
}
