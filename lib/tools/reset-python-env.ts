/**
 * reset_python_env — Reset the persistent Python session.
 *
 * Clears all variables and state. Optionally preserves import statements.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({
  keep_imports: z.boolean().default(true).describe('Keep import statements after reset (default: true)'),
});

type Input = z.infer<typeof schema>;

export class ResetPythonEnvTool extends BaseTool<Input, string> {
  name = 'reset_python_env';
  description = 'Reset the persistent Python session, clearing all variables and state. Use this when you want a fresh environment. Set keep_imports=true to preserve import statements.';
  schema = schema;

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const executor = getCodeExecutor();
    const sessionId = ctx?.sessionId || 'default';

    await executor.resetSession(sessionId, input.keep_imports);
    return `Python session reset.${input.keep_imports ? ' Import statements may need to be re-run.' : ''}`;
  }
}
