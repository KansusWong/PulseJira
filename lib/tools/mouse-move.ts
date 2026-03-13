/**
 * mouse_move — Move the mouse cursor to a specific screen position.
 *
 * Only available when DEPLOYMENT_MODE=local.
 * Uses cliclick (macOS) or xdotool (Linux).
 * Global tool. Requires approval.
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  x: z.number().describe('Target X coordinate on screen'),
  y: z.number().describe('Target Y coordinate on screen'),
  duration: z.number().default(0.3).describe('Movement duration in seconds (default: 0.3)'),
});

type Input = z.infer<typeof schema>;

export class MouseMoveTool extends BaseTool<Input, string> {
  name = 'mouse_move';
  description = 'Move the mouse cursor to the specified (x, y) screen coordinates. Only available in local deployment mode (DEPLOYMENT_MODE=local).';
  schema = schema;
  requiresApproval = true;

  private platform = process.platform;

  protected async _run(input: Input): Promise<string> {
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Mouse move is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    try {
      if (this.platform === 'darwin') {
        try {
          execSync(`cliclick m:${input.x},${input.y}`, { timeout: 5_000 });
        } catch {
          return 'Mouse move on macOS requires "cliclick" utility. Install via: brew install cliclick';
        }
      } else if (this.platform === 'linux') {
        execSync(`xdotool mousemove ${input.x} ${input.y}`, { timeout: 5_000 });
      } else {
        return 'Mouse move not supported on this platform.';
      }

      return `Mouse moved to (${input.x}, ${input.y}).`;
    } catch (err: any) {
      return `Mouse move error: ${err.message}`;
    }
  }
}
