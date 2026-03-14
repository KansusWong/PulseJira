/**
 * browser — Interactive browser automation via Playwright CDP.
 *
 * Supports navigation, clicking, typing, screenshots, content extraction,
 * waiting, scrolling, and session management.
 * Requires a Chrome DevTools endpoint (BROWSER_CDP_URL).
 * Global tool. Requires approval for interactive actions.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolRiskLevel } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getBrowserService } from '../services/browser-service';

const schema = z.object({
  command: z.enum(['goto', 'click', 'type', 'screenshot', 'get_content', 'wait', 'scroll', 'close'])
    .describe('Browser command to execute'),
  url: z.string().optional().describe('URL for goto command'),
  selector: z.string().optional().describe('CSS or XPath selector for click/type/wait commands'),
  text: z.string().optional().describe('Text to type (for type command)'),
  timeout: z.number().default(30000).describe('Timeout in milliseconds (default: 30000)'),
});

type Input = z.infer<typeof schema>;

export class BrowserTool extends BaseTool<Input, string> {
  name = 'browser';
  description = 'Interactive browser automation. Commands: goto (navigate to URL), click (click element), type (enter text), screenshot (capture page), get_content (extract text), wait (wait for element), scroll (scroll page), close (end session). Requires BROWSER_CDP_URL configuration.';
  schema = schema;
  requiresApproval = true;
  riskLevel = 'high' as const satisfies ToolRiskLevel;
  safety = { timeout: 60_000, retryCount: 0, maxResultSize: 100_000 };

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const service = getBrowserService();
    const sessionId = ctx?.sessionId || 'default';

    switch (input.command) {
      case 'goto': {
        if (!input.url) return 'Error: url is required for goto command.';
        return await service.goto(sessionId, input.url, input.timeout);
      }

      case 'click': {
        if (!input.selector) return 'Error: selector is required for click command.';
        return await service.click(sessionId, input.selector, input.timeout);
      }

      case 'type': {
        if (!input.selector) return 'Error: selector is required for type command.';
        if (!input.text) return 'Error: text is required for type command.';
        return await service.type(sessionId, input.selector, input.text, input.timeout);
      }

      case 'screenshot': {
        const result = await service.screenshot(sessionId);
        return `Screenshot captured (${result.width}x${result.height}). Base64 data length: ${result.base64.length} chars.`;
      }

      case 'get_content': {
        return await service.getContent(sessionId);
      }

      case 'wait': {
        if (!input.selector) return 'Error: selector is required for wait command.';
        return await service.waitForSelector(sessionId, input.selector, input.timeout);
      }

      case 'scroll': {
        return await service.scroll(sessionId, 'down', 500);
      }

      case 'close': {
        return await service.closeSession(sessionId);
      }

      default:
        return `Error: Unknown command "${input.command}".`;
    }
  }
}
