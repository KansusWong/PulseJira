/**
 * execute_python — Execute Python code with optional persistent session.
 *
 * Variables persist between calls when persistent=true (default).
 * Uses CodeExecutorService backend.
 * Global tool. Requires approval before execution.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({
  code: z.string().describe('Python code to execute'),
  timeout: z.number().min(1).max(300).default(30).describe('Execution timeout in seconds (1-300, default: 30)'),
  persistent: z.boolean().default(true).describe('Preserve variables between calls (default: true)'),
});

type Input = z.infer<typeof schema>;

export class ExecutePythonTool extends BaseTool<Input, string> {
  name = 'execute_python';
  description = 'Execute Python code. By default, variables persist between calls (persistent session). Set persistent=false for isolated execution. Useful for data analysis, computation, and scripting.';
  schema = schema;
  requiresApproval = true;
  safety = { timeout: 300_000, retryCount: 0, maxResultSize: 50_000 };

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const executor = getCodeExecutor();
    const sessionId = ctx?.sessionId || 'default';

    const result = await executor.executePython(
      input.code,
      sessionId,
      input.persistent,
      input.timeout,
    );

    const parts: string[] = [];

    if (result.stdout) {
      parts.push(`--- stdout ---\n${result.stdout}`);
    }
    if (result.stderr) {
      parts.push(`--- stderr ---\n${result.stderr}`);
    }

    parts.push(`--- exit code: ${result.exitCode} ---`);

    return parts.join('\n');
  }
}
