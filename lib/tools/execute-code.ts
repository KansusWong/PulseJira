/**
 * execute_code — Execute code in an isolated environment.
 *
 * Supports Python, JavaScript, and Bash.
 * Uses CodeExecutorService (Docker sandbox or local fallback).
 * Global tool. Requires approval before execution.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({
  code: z.string().describe('Code to execute'),
  language: z.enum(['python', 'javascript', 'bash']).default('python')
    .describe('Programming language: python, javascript, or bash'),
  timeout: z.number().min(1).max(300).default(30).describe('Execution timeout in seconds (1-300, default: 30)'),
});

type Input = z.infer<typeof schema>;

export class ExecuteCodeTool extends BaseTool<Input, string> {
  name = 'execute_code';
  description = 'Execute code in an isolated sandbox. Supports Python, JavaScript, and Bash. Each execution starts fresh (no state preserved between calls). Use execute_python for persistent sessions.';
  schema = schema;
  requiresApproval = true;
  safety = { timeout: 300_000, retryCount: 0, maxResultSize: 50_000 };

  protected async _run(input: Input): Promise<string> {
    const executor = getCodeExecutor();
    const result = await executor.executeCode(input.code, input.language, {
      timeout: input.timeout,
    });

    const parts: string[] = [];

    if (result.stdout) {
      parts.push(`--- stdout ---\n${result.stdout}`);
    }
    if (result.stderr) {
      parts.push(`--- stderr ---\n${result.stderr}`);
    }

    parts.push(`--- exit code: ${result.exitCode} ---`);

    if (result.files && result.files.length > 0) {
      parts.push(`--- output files ---\n${result.files.map(f => f.path).join('\n')}`);
    }

    return parts.join('\n');
  }
}
