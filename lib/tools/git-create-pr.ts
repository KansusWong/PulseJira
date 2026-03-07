/**
 * GitCreatePRTool — pushes the workspace branch and creates a GitHub PR.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { GitWorkspace } from '../sandbox/git-workspace';
import { createPullRequest, isGitHubAvailable } from '@/connectors/external/github';

const schema = z.object({
  title: z.string().describe('PR title'),
  body: z.string().describe('PR description (markdown)'),
  base_branch: z.string().optional().describe('Target branch to merge into (default: main)'),
});

type Input = z.infer<typeof schema>;

export class GitCreatePRTool extends BaseTool<Input, string> {
  name = 'git_create_pr';
  description = 'Push the current branch and create a GitHub Pull Request.';
  schema = schema;
  requiresApproval = true;

  constructor(
    private cwd: string,
    private repoOwner: string,
    private repoName: string,
    private branchName: string,
  ) {
    super();
  }

  protected async _run(input: Input): Promise<string> {
    if (!isGitHubAvailable()) {
      throw new Error('GITHUB_TOKEN is not configured. Cannot create PR.');
    }

    // Push the branch first
    const git = new GitWorkspace(this.cwd);
    await git.push();

    // Create the PR
    const pr = await createPullRequest({
      owner: this.repoOwner,
      repo: this.repoName,
      head: this.branchName,
      base: input.base_branch || 'main',
      title: input.title,
      body: input.body,
    });

    if (!pr) {
      throw new Error('Failed to create pull request via GitHub API.');
    }

    return `PR #${pr.number} created: ${pr.html_url}`;
  }
}
