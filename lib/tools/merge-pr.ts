/**
 * MergePRTool — merges a GitHub pull request.
 *
 * Wraps the GitHub connector's mergePullRequest API.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  owner: z.string().describe('Repository owner (GitHub user or org)'),
  repo: z.string().describe('Repository name'),
  pr_number: z.number().describe('Pull request number to merge'),
  method: z.enum(['merge', 'squash', 'rebase']).optional().describe('Merge method (default: squash)'),
  commit_title: z.string().optional().describe('Custom merge commit title'),
});

type Input = z.infer<typeof schema>;

interface MergeResult {
  merged: boolean;
  message: string;
}

export class MergePRTool extends BaseTool<Input, MergeResult> {
  name = 'merge_pr';
  description = 'Merge a GitHub pull request. Use squash merge by default.';
  schema = schema;

  protected async _run(input: Input): Promise<MergeResult> {
    const { mergePullRequest } = await import('@/connectors/external/github');
    return mergePullRequest(input.owner, input.repo, input.pr_number, {
      method: input.method || 'squash',
      commitTitle: input.commit_title,
    });
  }
}
