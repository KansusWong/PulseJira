/**
 * FinishImplementationTool — exit tool for developer/QA/reviewer agents.
 *
 * When the agent calls this tool, the ReAct loop terminates and
 * the tool's arguments become the structured output.
 * Follows the same pattern as FinishPlanningTool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  summary: z.string().describe('Summary of what was implemented/reviewed/tested'),
  files_changed: z.array(z.string()).describe('List of files that were created or modified'),
  tests_passing: z.boolean().describe('Whether all tests pass after the changes'),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'suggestion']),
      file: z.string().optional(),
      message: z.string(),
    })
  ).optional().describe('Issues found during review or testing (if any)'),
  verdict: z.enum(['approve', 'request_changes']).optional().describe('For reviewers: approve or request changes'),
});

type Input = z.infer<typeof schema>;

export class FinishImplementationTool extends BaseTool<Input, Input> {
  name = 'finish_implementation';
  description = 'Submit the final implementation/review/test report and finish the task. Call this when you are done.';
  schema = schema;

  protected async _run(input: Input): Promise<Input> {
    // This is an exit tool — the return value is never used by the agent.
    // The BaseAgent returns the tool call arguments directly when exitToolName matches.
    return input;
  }
}
