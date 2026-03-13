/**
 * web_fetch — Fetch and extract content from a URL.
 *
 * Uses Crawl4AI endpoint for content extraction with SSRF protection.
 * Global tool (no workspace dependency).
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { crawl4aiFetchUrl, isCrawl4AIAvailable } from '@/connectors/external/firecrawl';

const schema = z.object({
  url: z.string().url().describe('URL to fetch content from'),
  extract_mode: z.enum(['text', 'markdown']).default('markdown').describe('Output format: text or markdown'),
});

type Input = z.infer<typeof schema>;

export class WebFetchTool extends BaseTool<Input, string> {
  name = 'web_fetch';
  description = 'Fetch and extract content from a URL. Returns the page content as markdown or plain text. Use this for reading specific web pages, documentation, or articles.';
  schema = schema;

  protected async _run(input: Input): Promise<string> {
    if (!isCrawl4AIAvailable()) {
      return 'Web fetch not available (CRAWL4AI_API_URL not configured).';
    }

    const content = await crawl4aiFetchUrl(input.url);
    if (!content) {
      return `No content could be extracted from: ${input.url}`;
    }

    if (input.extract_mode === 'text') {
      // Strip markdown formatting for plain text
      return content
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
        .replace(/[*_~`#]/g, '')                      // formatting
        .replace(/\n{3,}/g, '\n\n')                   // excess newlines
        .slice(0, 50_000);
    }

    return content.slice(0, 50_000);
  }
}
