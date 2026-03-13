import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const TaskSummarySchema = z.object({
  task_id: z.string(),
  title: z.string(),
  status: z.string(),
  project_name: z.string().nullable(),
  outcome: z.string().describe('交付结果描述'),
});

const TraceInsightSchema = z.object({
  trace_id: z.string(),
  project_name: z.string().nullable(),
  stage: z.string(),
  status: z.string(),
  tokens: z.number().describe('该执行追踪消耗的 token 数'),
  insight: z.string().describe('该执行追踪的关键观察'),
});

const CostInsightSchema = z.object({
  total_tokens: z.number().describe('今日所有 LLM 调用的 token 总量'),
  top_cost_agents: z.array(
    z.object({
      agent_name: z.string(),
      tokens: z.number().describe('该 Agent 消耗的 token 数'),
      percentage: z.number(),
      work_summary: z.string().describe('该Agent消耗Token所完成的工作概要（一句话精简描述）'),
    }),
  ),
  cost_trend_note: z.string().describe('Token 消耗趋势观察'),
});

const PredictionTrendSchema = z.object({
  decision_count: z.number(),
  avg_confidence: z.number().nullable(),
  trend_direction: z
    .enum(['improving', 'stable', 'declining', 'insufficient_data'])
    .describe('决策置信度趋势方向'),
  trend_note: z.string().describe('决策置信度趋势分析'),
});

const ProjectAlignmentSchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  status: z.string(),
  tasks_completed: z.number(),
  tasks_total: z.number(),
  tokens: z.number().describe('该项目消耗的 token 数'),
  alignment_note: z.string().describe('与项目目标的对齐度分析'),
});

// ---------------------------------------------------------------------------
// Report schema
// ---------------------------------------------------------------------------

const FinishDailyReportSchema = z.object({
  report_date: z.string().describe('报告日期 YYYY-MM-DD'),
  executive_summary: z.string().describe('高管摘要：今日关键成果 (2-3句话)'),

  task_deliverables: z.array(TaskSummarySchema).describe('L2/L3 任务交付物清单'),
  delivery_outcomes: z
    .object({
      prs_created: z.number(),
      deployments_completed: z.number(),
      decisions_made: z.number(),
      code_changes_summary: z.string(),
    })
    .describe('交付成果汇总'),

  trace_insights: z.array(TraceInsightSchema).describe('执行追踪关键洞察'),
  cost_analysis: CostInsightSchema.describe('Token 消耗分析'),
  prediction_trend: PredictionTrendSchema.describe('Decision Maker 置信度趋势'),
  project_alignment: z.array(ProjectAlignmentSchema).describe('项目进度对齐分析'),

  risks_and_blockers: z.array(z.string()).describe('风险与阻塞项'),
  recommendations: z.array(z.string()).describe('明日行动建议'),
});

export type FinishDailyReportInput = z.infer<typeof FinishDailyReportSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/**
 * Analyst daily-report 模式的退出工具。
 * 提交结构化每日报告并退出 ReAct 循环。
 */
export class FinishDailyReportTool extends BaseTool<FinishDailyReportInput, FinishDailyReportInput> {
  name = 'finish_daily_report';
  description =
    '提交结构化每日报告并退出。报告必须包含任务交付物、成本分析、决策趋势和项目对齐分析。仅在完成所有数据分析后调用。';
  schema = FinishDailyReportSchema;

  protected async _run(input: FinishDailyReportInput): Promise<FinishDailyReportInput> {
    return input;
  }
}
