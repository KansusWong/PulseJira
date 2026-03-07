/**
 * GitCommitTool — stages and commits changes within a workspace.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { GitWorkspace } from '../sandbox/git-workspace';

const schema = z.object({
  message: z.string().describe('Commit message describing the changes'),
  files: z.array(z.string()).optional().describe('Specific files to stage. If omitted, stages all changes.'),
});

type Input = z.infer<typeof schema>;

export class GitCommitTool extends BaseTool<Input, string> {
  name = 'git_commit';
  description = 'Stage and commit code changes in the workspace git repository.';
  schema = schema;
  requiresApproval = true;

  constructor(private cwd: string) {
    super();
  }

  protected async _run(input: Input): Promise<string> {
    const git = new GitWorkspace(this.cwd);

    if (input.files && input.files.length > 0) {
      await git.add(input.files);
    } else {
      await git.add();
    }

    const sha = await git.commit(input.message);
    return `Committed: ${sha.slice(0, 8)} — ${input.message}`;
  }
}
