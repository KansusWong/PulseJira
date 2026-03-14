/**
 * keyboard_hotkey — Press a keyboard shortcut / hotkey combination.
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
  keys: z.string().describe('Hotkey combo, e.g. "ctrl+c", "cmd+shift+s", "alt+tab"'),
});

type Input = z.infer<typeof schema>;

export class KeyboardHotkeyTool extends BaseTool<Input, string> {
  name = 'keyboard_hotkey';
  description = 'Press a keyboard shortcut (hotkey combination). Format: modifier keys joined by "+", e.g. "ctrl+c", "cmd+shift+s", "alt+tab". Only available in local deployment mode (DEPLOYMENT_MODE=local).';
  schema = schema;
  requiresApproval = true;
  riskLevel = 'high' as const satisfies ToolRiskLevel;

  private platform = process.platform;

  protected async _run(input: Input): Promise<string> {
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Keyboard hotkey is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    if (!input.keys) {
      return 'Error: keys is required.';
    }

    try {
      const keys = input.keys.toLowerCase().split('+').map(k => k.trim());

      if (this.platform === 'darwin') {
        const modifierMap: Record<string, string> = {
          'ctrl': 'control down',
          'control': 'control down',
          'cmd': 'command down',
          'command': 'command down',
          'alt': 'option down',
          'option': 'option down',
          'shift': 'shift down',
        };

        const modifiers = keys.slice(0, -1).map(k => modifierMap[k] || '').filter(Boolean);
        const key = keys[keys.length - 1];
        const modString = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
        const script = `tell application "System Events" to keystroke "${key}"${modString}`;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5_000 });
      } else if (this.platform === 'linux') {
        const xdoKeys = keys.join('+');
        execSync(`xdotool key ${xdoKeys}`, { timeout: 5_000 });
      } else {
        return 'Keyboard hotkey not supported on this platform.';
      }

      return `Pressed hotkey: ${input.keys}`;
    } catch (err: any) {
      return `Keyboard hotkey error: ${err.message}`;
    }
  }
}
