/**
 * FinishDeployTool — exit tool for the Deployer agent.
 *
 * When the agent calls this tool, the ReAct loop terminates and
 * the tool's arguments become the structured output.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  state: z.enum(['success', 'failed', 'rolled_back']).describe('Final deployment state'),
  deployment_url: z.string().nullable().describe('Live deployment URL (null if failed)'),
  merged_at: z.string().nullable().describe('ISO timestamp of PR merge (null if not merged)'),
  health_check: z.object({
    healthy: z.boolean(),
    status: z.number(),
    latencyMs: z.number(),
    checkedAt: z.string(),
  }).nullable().describe('Health check result (null if not performed)'),
  summary: z.string().describe('Summary of what happened during deployment'),
  error: z.string().nullable().optional().describe('Error message if failed'),
});

type Input = z.infer<typeof schema>;

export class FinishDeployTool extends BaseTool<Input, Input> {
  name = 'finish_deploy';
  description = 'Submit the final deployment report and finish the deploy task. Call this when deployment is complete (success, failure, or rollback).';
  schema = schema;

  protected async _run(input: Input): Promise<Input> {
    return input;
  }
}
