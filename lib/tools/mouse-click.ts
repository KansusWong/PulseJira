/**
 * mouse_click — Click the mouse at a specific screen position.
 *
 * Only available when DEPLOYMENT_MODE=local.
 * Uses osascript (macOS) or xdotool (Linux).
 * Global tool. Requires approval.
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import { BaseTool } from '../core/base-tool';
import type { ToolRiskLevel } from '../core/base-tool';

const schema = z.object({
  x: z.number().describe('X coordinate on screen'),
  y: z.number().describe('Y coordinate on screen'),
  button: z.enum(['left', 'right', 'middle']).default('left')
    .describe('Mouse button to click (default: left)'),
  clicks: z.number().default(1).describe('Number of clicks (default: 1, use 2 for double-click)'),
});

type Input = z.infer<typeof schema>;

export class MouseClickTool extends BaseTool<Input, string> {
  name = 'mouse_click';
  description = 'Click the mouse at given (x, y) screen coordinates. Supports left/right/middle button and single/double click. Only available in local deployment mode (DEPLOYMENT_MODE=local).';
  schema = schema;
  requiresApproval = true;
  riskLevel = 'high' as const satisfies ToolRiskLevel;

  private platform = process.platform;

  protected async _run(input: Input): Promise<string> {
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Mouse click is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    try {
      const clicks = input.clicks || 1;

      if (this.platform === 'darwin') {
        const clickType = clicks === 2 ? 'double click' : 'click';
        const script = `
          tell application "System Events"
            ${clickType} at {${input.x}, ${input.y}}
          end tell
        `;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5_000 });
      } else if (this.platform === 'linux') {
        const clickFlag = clicks === 2 ? '--repeat 2 --delay 100' : '';
        const buttonFlag = input.button === 'right' ? '3' : input.button === 'middle' ? '2' : '1';
        execSync(`xdotool mousemove ${input.x} ${input.y} click ${clickFlag} ${buttonFlag}`, { timeout: 5_000 });
      } else {
        return 'Mouse click not supported on this platform.';
      }

      return `Clicked at (${input.x}, ${input.y}) with ${input.button || 'left'} button (${clicks}x).`;
    } catch (err: any) {
      return `Mouse click error: ${err.message}`;
    }
  }
}
