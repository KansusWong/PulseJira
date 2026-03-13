/**
 * check_executor — Check the status of the code execution backend.
 *
 * Returns whether Docker or local mode is active, health status,
 * and number of active sessions.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getCodeExecutor } from '../services/code-executor';

const schema = z.object({});

type Input = z.infer<typeof schema>;

export class CheckExecutorTool extends BaseTool<Input, string> {
  name = 'check_executor';
  description = 'Check the status of the code execution backend. Returns the execution mode (docker/local), health status, and number of active Python sessions.';
  schema = schema;

  protected async _run(): Promise<string> {
    const executor = getCodeExecutor();
    const status = await executor.checkStatus();

    return [
      `Mode: ${status.mode}`,
      `Healthy: ${status.healthy ? 'yes' : 'no'}`,
      `Active sessions: ${status.sessions}`,
    ].join('\n');
  }
}
