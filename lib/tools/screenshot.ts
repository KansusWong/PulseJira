/**
 * screenshot — Capture a screenshot of the current desktop.
 *
 * Only available when DEPLOYMENT_MODE=local.
 * Uses native system commands (screencapture on macOS, gnome-screenshot/import on Linux).
 * Global tool. Requires approval.
 */

import { z } from 'zod';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BaseTool } from '../core/base-tool';

const schema = z.object({});

type Input = z.infer<typeof schema>;

export class ScreenshotTool extends BaseTool<Input, string> {
  name = 'screenshot';
  description = 'Take a screenshot of the current desktop screen. Returns the screenshot file path and base64 data. Only available in local deployment mode (DEPLOYMENT_MODE=local).';
  schema = schema;
  requiresApproval = true;

  private platform = process.platform;

  protected async _run(): Promise<string> {
    if (process.env.DEPLOYMENT_MODE !== 'local') {
      return 'Screenshot is only available in local deployment mode. Set DEPLOYMENT_MODE=local to enable.';
    }

    try {
      const tmpPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);

      if (this.platform === 'darwin') {
        execSync(`screencapture -x "${tmpPath}"`, { timeout: 10_000 });
      } else if (this.platform === 'linux') {
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
    } catch (err: any) {
      return `Screenshot error: ${err.message}`;
    }
  }
}
