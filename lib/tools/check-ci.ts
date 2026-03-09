/**
 * CheckCITool — checks the CI status of a PR's head commit.
 *
 * Returns aggregated status of all check runs (GitHub Actions + third-party CI).
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  ref: z.string().describe('Git ref (commit SHA or branch name) to check'),
});

type Input = z.infer<typeof schema>;

interface CIResult {
  state: 'success' | 'failure' | 'pending' | 'error';
  total: number;
  passed: number;
  failed: number;
  pending: number;
  checks: { name: string; status: string; conclusion: string | null }[];
}

export class CheckCITool extends BaseTool<Input, CIResult> {
  name = 'check_ci';
  description = 'Check CI status for a git ref. Returns aggregated pass/fail/pending counts.';
  schema = schema;

  protected async _run(input: Input): Promise<CIResult> {
    const { getPRChecks } = await import('@/connectors/external/github');
    return getPRChecks(input.owner, input.repo, input.ref);
  }
}
