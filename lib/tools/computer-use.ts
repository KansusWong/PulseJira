/**
 * computer_use — Desktop control for local deployments.
 *
 * Supports screenshots, mouse clicks, keyboard typing, hotkeys, and mouse movement.
 * Only available when DEPLOYMENT_MODE=local.
 * Uses native system commands (screencapture/osascript on macOS, xdotool on Linux).
 * Global tool. Requires approval for all actions.
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  action: z.enum(['screenshot', 'mouse_click', 'keyboard_type', 'keyboard_hotkey', 'mouse_move'])
    .describe('Desktop control action'),
  x: z.number().optional().describe('X coordinate for mouse actions'),
  y: z.number().optional().describe('Y coordinate for mouse actions'),
  text: z.string().optional().describe('Text to type (for keyboard_type)'),
  keys: z.string().optional().describe('Hotkey combo for keyboard_hotkey (e.g., "ctrl+c", "cmd+shift+s")'),
  button: z.enum(['left', 'right', 'middle']).default('left').optional()
    .describe('Mouse button (default: left)'),
  clicks: z.number().default(1).optional().describe('Number of clicks (default: 1)'),
  duration: z.number().default(0.3).optional().describe('Action duration in seconds'),
});

type Input = z.infer<typeof schema>;

export class ComputerUseTool extends BaseTool<Input, string> {
  name = 'computer_use';
  description = 'Control the local desktop: take screenshots, click mouse, type text, press hotkeys. Only available in local deployment mode (DEPLOYMENT_MODE=local). Actions: screenshot, mouse_click, keyboard_type, keyboard_hotkey, mouse_move.';
  schema = schema;
  requiresApproval = true;

  private platform = process.platform;

  protected async _run(input: Input): Promise<string> {
    // Only allow in local mode
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Computer use is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    try {
      switch (input.action) {
        case 'screenshot':
          return this.takeScreenshot();
        case 'mouse_click':
          return this.mouseClick(input);
        case 'keyboard_type':
          return this.keyboardType(input);
        case 'keyboard_hotkey':
          return this.keyboardHotkey(input);
        case 'mouse_move':
          return this.mouseMove(input);
        default:
          return `Error: Unknown action "${input.action}".`;
      }
    } catch (err: any) {
      return `Computer use error: ${err.message}`;
    }
  }

  private takeScreenshot(): string {
    const tmpPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);

    if (this.platform === 'darwin') {
      execSync(`screencapture -x "${tmpPath}"`, { timeout: 10_000 });
    } else if (this.platform === 'linux') {
      // Try gnome-screenshot first, fallback to import (ImageMagick)
      try {
        execSync(`gnome-screenshot -f "${tmpPath}"`, { timeout: 10_000 });
      } catch {
        execSync(`import -window root "${tmpPath}"`, { timeout: 10_000 });
      }
    } else {
      return 'Screenshot not supported on this platform.';
    }

    if (!fs.existsSync(tmpPath)) {
      return 'Error: Screenshot capture failed.';
    }

    const buffer = fs.readFileSync(tmpPath);
    const base64 = buffer.toString('base64');

    // Cleanup
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    return `Screenshot captured (${buffer.length} bytes). Base64 length: ${base64.length} chars.\nPath: ${tmpPath}`;
  }

  private mouseClick(input: Input): string {
    if (input.x === undefined || input.y === undefined) {
      return 'Error: x and y coordinates are required for mouse_click.';
    }

    const clicks = input.clicks || 1;

    if (this.platform === 'darwin') {
      // Use osascript to click via AppleScript
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
  }

  private keyboardType(input: Input): string {
    if (!input.text) {
      return 'Error: text is required for keyboard_type.';
    }

    if (this.platform === 'darwin') {
      const escaped = input.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `tell application "System Events" to keystroke "${escaped}"`;
      execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5_000 });
    } else if (this.platform === 'linux') {
      const escaped = input.text.replace(/'/g, "'\\''");
      execSync(`xdotool type --clearmodifiers '${escaped}'`, { timeout: 5_000 });
    } else {
      return 'Keyboard typing not supported on this platform.';
    }

    return `Typed: "${input.text.slice(0, 50)}${input.text.length > 50 ? '...' : ''}"`;
  }

  private keyboardHotkey(input: Input): string {
    if (!input.keys) {
      return 'Error: keys is required for keyboard_hotkey.';
    }

    const keys = input.keys.toLowerCase().split('+').map(k => k.trim());

    if (this.platform === 'darwin') {
      // Convert to AppleScript key down/up
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
  }

  private mouseMove(input: Input): string {
    if (input.x === undefined || input.y === undefined) {
      return 'Error: x and y coordinates are required for mouse_move.';
    }

    if (this.platform === 'darwin') {
      const script = `
        tell application "System Events"
          -- Move mouse using Core Graphics events
        end tell
      `;
      // AppleScript mouse move is limited; use cliclick if available
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
  }
}
