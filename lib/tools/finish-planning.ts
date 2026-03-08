import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const TaskSchema = z.object({
  title: z.string().describe('Short task title'),
  description: z.string().describe('Detailed description of what needs to be done'),
  type: z.enum(['feature', 'bug', 'chore']).describe('Task type'),
  priority: z.enum(['high', 'medium', 'low']).describe('Priority level'),
  affected_files: z.array(z.string()).describe('File paths that need to be created or modified'),
  estimated_complexity: z.enum(['low', 'medium', 'high']).optional()
    .describe('Task complexity estimate: low=simple config/rename (few files), medium=standard feature, high=complex multi-file logic with many dependencies'),
});

const FinishPlanningInputSchema = z.object({
  tasks: z.array(TaskSchema).describe('Array of development tasks'),
  rationale: z.string().optional().describe('Overall rationale for the plan'),
});

export type PlanTask = z.infer<typeof TaskSchema>;
export type FinishPlanningInput = z.infer<typeof FinishPlanningInputSchema>;

/**
 * Exit signal tool for the TechLead agent's ReAct loop.
 * When the agent calls this tool, the loop terminates and returns the task plan.
 */
export class FinishPlanningTool extends BaseTool<FinishPlanningInput, FinishPlanningInput> {
  name = 'finish_planning';
  description = 'Submit your final development task plan and exit the planning loop. Call this ONLY when you have gathered enough context from the codebase and are confident in your plan. Each task must include affected_files with real paths you have verified.';
  schema = FinishPlanningInputSchema;

  protected async _run(input: FinishPlanningInput): Promise<FinishPlanningInput> {
    return input;
  }
}
