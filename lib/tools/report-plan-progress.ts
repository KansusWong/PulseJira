import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { messageBus } from '@/connectors/bus/message-bus';

const ReportPlanProgressInputSchema = z.object({
  step_index: z
    .number()
    .int()
    .min(-1)
    .describe('0-based index into plan_outline. Use -1 for steps not in the original plan.'),
  status: z
    .enum(['active', 'completed', 'skipped'])
    .describe('Current status of the plan step.'),
  summary: z
    .string()
    .optional()
    .describe('Brief summary of what was done or why the step was skipped.'),
});

type ReportPlanProgressInput = z.infer<typeof ReportPlanProgressInputSchema>;

/**
 * Lightweight tool for the Architect to report plan step progress.
 * Publishes a `plan_step_progress` event on the messageBus which flows
 * through SSE to the frontend PlanPanel for real-time status updates.
 *
 * Zero side-effects beyond event publishing — cannot fail.
 */
export class ReportPlanProgressTool extends BaseTool<ReportPlanProgressInput, string> {
  name = 'report_plan_progress';
  description =
    '报告计划步骤的执行进度。在开始每个主要子任务前调用 status="active"，完成后调用 status="completed"，跳过时调用 status="skipped"。step_index 对应 plan_outline 的 0-based 下标，-1 表示计划外步骤。';
  schema = ReportPlanProgressInputSchema;

  protected async _run(input: ReportPlanProgressInput): Promise<string> {
    messageBus.publish({
      from: 'architect',
      channel: 'agent-log',
      type: 'plan_step_progress',
      payload: {
        step_index: input.step_index,
        status: input.status,
        summary: input.summary,
      },
    });

    const label = input.summary
      ? `Step ${input.step_index}: ${input.status} — ${input.summary}`
      : `Step ${input.step_index}: ${input.status}`;

    return `Progress reported: ${label}`;
  }
}
