/**
 * python_repl — Evaluate a single Python expression in the persistent session.
 *
 * Lightweight REPL for quick evaluations (single-line expressions).
 * Uses the same persistent Python session as execute_python.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({
  expression: z.string().describe('Python expression to evaluate (e.g., "2 + 2", "len(df)", "df.head()")'),
});

type Input = z.infer<typeof schema>;

export class PythonReplTool extends BaseTool<Input, string> {
  name = 'python_repl';
  description = 'Evaluate a single Python expression and return the result. Uses the same persistent session as execute_python, so all variables are accessible. Good for quick checks, calculations, and inspecting data.';
  schema = schema;

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const executor = getCodeExecutor();
    const sessionId = ctx?.sessionId || 'default';

    try {
      const result = await executor.evalExpression(input.expression, sessionId);
      return result;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }
}
