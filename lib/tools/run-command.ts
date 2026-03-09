/**
 * RunCommandTool — executes a sandboxed shell command within a workspace.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { CommandRunner } from '../sandbox/command-runner';

const schema = z.object({
  command: z.string().describe('The command to run (e.g., "npm", "npx", "git")'),
  args: z.array(z.string()).describe('Command arguments (e.g., ["install", "--save", "zod"])'),
});

type Input = z.infer<typeof schema>;

export class RunCommandTool extends BaseTool<Input, string> {
  name = 'run_command';
  description = 'Execute a whitelisted command within the workspace. Allowed commands: npm, npx, node, git, tsc, pnpm, yarn.';
  schema = schema;

  private runner: CommandRunner;

  constructor(cwd: string, allowedCommands?: string[]) {
    super();
    this.runner = new CommandRunner(cwd, allowedCommands);
  }

  protected async _run(input: Input): Promise<string> {
    const result = await this.runner.run(input.command, input.args);

    const parts: string[] = [];
    if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
    if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
    parts.push(`exit code: ${result.exitCode}`);
    if (result.timedOut) parts.push('(timed out)');

    return parts.join('\n');
  }
}
