import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const ExecutionStepSchema = z.object({
  step_id: z.string(),
  action: z.string(),
  agent_or_tool: z.string(),
  status: z.string(),
  output_summary: z.string(),
});

const FinishArchitectInputSchema = z.object({
  summary: z.string().describe('Overall execution summary'),
  execution_trace: z.array(ExecutionStepSchema).describe('Ordered list of executed steps'),
  final_output: z.any().describe('The primary deliverable of this execution'),
  steps_completed: z.number().describe('Number of steps completed successfully'),
  steps_failed: z.number().describe('Number of steps that failed'),
  steps_retried: z.number().describe('Number of steps that required retry'),
  created_agents: z.array(z.string()).optional().describe('IDs of dynamically created agents'),
  created_skills: z.array(z.string()).optional().describe('IDs of dynamically created skills'),
});

export type FinishArchitectInput = z.infer<typeof FinishArchitectInputSchema>;

/**
 * Exit signal tool for the Architect agent.
 * When called, the ReAct loop terminates and returns the execution report.
 */
export class FinishArchitectTool extends BaseTool<FinishArchitectInput, FinishArchitectInput> {
  name = 'finish_architect';
  description = '提交架构执行报告并退出执行循环。必须包含完整的执行轨迹和最终产出。仅在所有必要步骤完成后调用。';
  schema = FinishArchitectInputSchema;

  protected async _run(input: FinishArchitectInput): Promise<FinishArchitectInput> {
    return input;
  }
}
