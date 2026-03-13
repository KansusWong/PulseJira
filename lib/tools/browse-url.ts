/**
 * browse_url — Simple URL content extraction via Crawl4AI.
 *
 * Simpler than web_fetch — just give it a URL and get markdown back.
 * Uses the same Crawl4AI backend.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { crawl4aiFetchUrl, isCrawl4AIAvailable } from '@/connectors/external/firecrawl';

const schema = z.object({
  url: z.string().url().describe('URL to browse and extract content from'),
  wait_for: z.string().optional().describe('CSS selector to wait for before extracting content'),
});

type Input = z.infer<typeof schema>;

export class BrowseUrlTool extends BaseTool<Input, string> {
  name = 'browse_url';
  description = 'Browse a URL and extract its content as markdown. Simple content extraction — for interactive browser control, use the browser tool instead.';
  schema = schema;

  protected async _run(input: Input): Promise<string> {
    if (!isCrawl4AIAvailable()) {
      return 'Browse URL not available (CRAWL4AI_API_URL not configured).';
    }

    const content = await crawl4aiFetchUrl(input.url);
    if (!content) {
      return `No content could be extracted from: ${input.url}`;
    }

    return content.slice(0, 50_000);
  }
}
