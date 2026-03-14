/**
 * keyboard_type — Type text using the keyboard.
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
  text: z.string().describe('Text to type on the keyboard'),
  interval: z.number().default(0).describe('Delay between keystrokes in seconds (default: 0)'),
});

type Input = z.infer<typeof schema>;

export class KeyboardTypeTool extends BaseTool<Input, string> {
  name = 'keyboard_type';
  description = 'Type text as keyboard input. Simulates real keystrokes at the current cursor position. Set interval > 0 for slower, human-like typing. Only available in local deployment mode (DEPLOYMENT_MODE=local).';
  schema = schema;
  requiresApproval = true;
  riskLevel = 'high' as const satisfies ToolRiskLevel;

  private platform = process.platform;

  protected async _run(input: Input): Promise<string> {
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Keyboard type is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    if (!input.text) {
      return 'Error: text is required.';
    }

    try {
      if (this.platform === 'darwin') {
        const escaped = input.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "System Events" to keystroke "${escaped}"`;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5_000 });
      } else if (this.platform === 'linux') {
        const escaped = input.text.replace(/'/g, "'\\''");
        const delayFlag = input.interval > 0 ? `--delay ${Math.round(input.interval * 1000)}` : '';
        execSync(`xdotool type --clearmodifiers ${delayFlag} '${escaped}'`, { timeout: 5_000 });
      } else {
        return 'Keyboard typing not supported on this platform.';
      }

      return `Typed: "${input.text.slice(0, 50)}${input.text.length > 50 ? '...' : ''}"`;
    } catch (err: any) {
      return `Keyboard type error: ${err.message}`;
    }
  }
}
