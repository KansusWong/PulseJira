/**
 * RunTestsTool — executes the test suite within a workspace.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { CommandRunner } from '../sandbox/command-runner';
import type { ToolContext } from '../core/tool-context';

const schema = z.object({
  test_command: z.string().optional().describe('Override test command (default: "npm test")'),
  test_args: z.array(z.string()).optional().describe('Additional args for the test command'),
});

type Input = z.infer<typeof schema>;

export class RunTestsTool extends BaseTool<Input, string> {
  name = 'run_tests';
  description = 'Run the project test suite. Defaults to "npm test". Returns test output and pass/fail status.';
  schema = schema;

  private runner?: CommandRunner;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.runner = new CommandRunner(cwd, ['npm', 'npx', 'node', 'pnpm', 'yarn'], 120_000);
    }
  }

  private getRunner(ctx?: ToolContext): CommandRunner {
    if (this.runner) return this.runner;
    const cwd = ctx?.workspacePath;
    if (!cwd) throw new Error('No workspace: provide cwd in constructor or ToolContext.');
    return new CommandRunner(cwd, ['npm', 'npx', 'node', 'pnpm', 'yarn'], 120_000);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const command = input.test_command || 'npm';
    const args = input.test_command
      ? input.test_args || []
      : ['test', '--', ...(input.test_args || [])];

    const result = await this.getRunner(ctx).run(command, args);

    const passed = result.exitCode === 0;

    return [
      `Tests ${passed ? 'PASSED ✓' : 'FAILED ✗'}`,
      `Exit code: ${result.exitCode}`,
      result.timedOut ? '(timed out)' : '',
      result.stdout ? `\nOutput:\n${result.stdout}` : '',
      result.stderr ? `\nErrors:\n${result.stderr}` : '',
    ].filter(Boolean).join('\n');
  }
}
