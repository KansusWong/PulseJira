import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { crawl4aiSearch, isCrawl4AIAvailable } from '@/connectors/external/firecrawl';

const WebSearchInputSchema = z.object({
  query: z.string().describe('Search query to find information on the web'),
});

type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

/**
 * Searches the web using a Crawl4AI endpoint.
 * Returns summarized markdown results from top pages.
 */
export class WebSearchTool extends BaseTool<WebSearchInput, string> {
  name = 'web_search';
  description = 'Search the web for real-time information. Use when you need current market data, competitor analysis, or to verify factual claims. Returns summarized content from top 3 results.';
  schema = WebSearchInputSchema;

  protected async _run(input: WebSearchInput): Promise<string> {
    if (!isCrawl4AIAvailable()) {
      return 'No search capability available (CRAWL4AI_API_URL not configured).';
    }

    const results = await crawl4aiSearch(input.query, 3);
    if (results.length === 0) return 'No results found.';

    return results
      .map((item) =>
        `Source: ${item.url}\nTitle: ${item.title}\nContent: ${item.markdown}...`
      )
      .join('\n\n');
  }
}
