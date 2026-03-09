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
  description = 'Search the web for real-time information. Returns top 3 results. For time-sensitive queries (weather, news, prices, events), include the specific date in your query. For location queries, include the location. Call this tool only ONCE per question — do not retry with rephrased queries.';
  schema = WebSearchInputSchema;

  private static TIME_SENSITIVE = /今天|明天|后天|昨天|本周|这周|下周|本月|今年|明年|最新|最近|实时|weather|forecast|news|stock|score|price|今日|当前|现在|tomorrow|yesterday|today/i;
  private static HAS_DATE = /\d{4}[-年\/]\d{1,2}[-月\/]\d{1,2}/;

  private enhanceQuery(query: string): string {
    if (WebSearchTool.HAS_DATE.test(query)) return query;
    if (!WebSearchTool.TIME_SENSITIVE.test(query)) return query;

    const now = new Date();
    let target = new Date(now);
    if (/明天|tomorrow/i.test(query)) target.setDate(now.getDate() + 1);
    else if (/后天/i.test(query)) target.setDate(now.getDate() + 2);
    else if (/昨天|yesterday/i.test(query)) target.setDate(now.getDate() - 1);

    return `${query} ${target.toISOString().split('T')[0]}`;
  }

  protected async _run(input: WebSearchInput): Promise<string> {
    if (!isCrawl4AIAvailable()) {
      return 'No search capability available (CRAWL4AI_API_URL not configured).';
    }

    const results = await crawl4aiSearch(this.enhanceQuery(input.query), 3);
    if (results.length === 0) return 'No results found.';

    return results
      .map((item) =>
        `Source: ${item.url}\nTitle: ${item.title}\nContent: ${item.markdown}...`
      )
      .join('\n\n');
  }
}
