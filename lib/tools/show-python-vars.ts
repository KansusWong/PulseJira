/**
 * show_python_vars — List all variables in the persistent Python session.
 *
 * Returns variable names, types, and preview values.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({});

type Input = z.infer<typeof schema>;

export class ShowPythonVarsTool extends BaseTool<Input, string> {
  name = 'show_python_vars';
  description = 'List all variables currently defined in the persistent Python session. Shows variable name, type, and a preview of the value.';
  schema = schema;

  protected async _run(_input: Input, ctx?: ToolContext): Promise<string> {
    const executor = getCodeExecutor();
    const sessionId = ctx?.sessionId || 'default';

    const vars = await executor.getSessionVars(sessionId);

    if (Object.keys(vars).length === 0) {
      return 'No variables in current session. (Session may not be active — run execute_python first.)';
    }

    const lines = Object.entries(vars).map(([name, info]) => `  ${name}: ${info}`);
    return `Python session variables (${lines.length}):\n${lines.join('\n')}`;
  }
}
