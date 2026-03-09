/**
 * Crawl4AI external connector — wraps a configurable Crawl4AI endpoint.
 *
 * Optional env:
 * - CRAWL4AI_API_URL: full endpoint URL.
 *   - Official server: http://127.0.0.1:11235/crawl (default)
 *   - Optional custom gateway: any endpoint that accepts {query, limit}
 */
import { validateExternalUrl, filterSafeUrls } from '@/lib/utils/url-validator';

const DEFAULT_CRAWL4AI_API_URL = 'http://127.0.0.1:11235/crawl';

export interface Crawl4AISearchResult {
  url: string;
  title: string;
  markdown: string;
}

interface NormalizeOptions {
  allowDuckDuckGo?: boolean;
  markdownLimit?: number;
}

// Backward-compatible type alias for old imports.
export type FirecrawlSearchResult = Crawl4AISearchResult;

function getEndpoint(): string | null {
  const url = process.env.CRAWL4AI_API_URL?.trim();
  return url || DEFAULT_CRAWL4AI_API_URL;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isCrawlEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.pathname.includes('/crawl');
  } catch {
    return endpoint.includes('/crawl');
  }
}

function isDuckDuckGoUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('duckduckgo.com') || hostname.includes('external-content.duckduckgo.com');
  } catch {
    return false;
  }
}

function getItemMarkdown(item: any): string {
  const markdown = item?.markdown;
  if (typeof markdown === 'string') return markdown;
  if (markdown && typeof markdown === 'object') {
    return String(markdown.raw_markdown || markdown.markdown_with_citations || '').trim();
  }
  return String(item?.content || item?.text || '').trim();
}

function normalizeResults(payload: any, options: NormalizeOptions = {}): Crawl4AISearchResult[] {
  const { allowDuckDuckGo = false, markdownLimit = 2000 } = options;
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

  return raw
    .map((item: any) => ({
      url: String(item?.redirected_url || item?.url || item?.link || item?.source_url || '').trim(),
      title: String(item?.metadata?.title || item?.title || item?.name || item?.url || 'Untitled').trim(),
      markdown: getItemMarkdown(item).slice(0, markdownLimit).trim(),
    }))
    .filter(
      (item: Crawl4AISearchResult) =>
        item.url.length > 0 && (allowDuckDuckGo || !isDuckDuckGoUrl(item.url))
    );
}

function decodeDuckDuckGoRedirect(url: string): string {
  try {
    const normalized = url.startsWith('//') ? `https:${url}` : url;
    const parsed = new URL(normalized);
    const isDdgRedirect = parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname === '/l/';
    if (!isDdgRedirect) return normalized;

    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : normalized;
  } catch {
    return url;
  }
}

function extractUrlsFromMarkdown(markdown: string, limit: number): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const markdownLinkRegex = /\((https?:\/\/[^\s)]+)\)/g;
  const plainUrlRegex = /https?:\/\/[^\s)"'<>]+/g;

  const candidates = [
    ...Array.from(markdown.matchAll(markdownLinkRegex), (match) => match[1]),
    ...Array.from(markdown.matchAll(plainUrlRegex), (match) => match[0]),
  ];

  for (const rawCandidate of candidates) {
    const candidate = decodeDuckDuckGoRedirect(rawCandidate);
    if (!isHttpUrl(candidate)) continue;
    if (isDuckDuckGoUrl(candidate)) continue;

    // SSRF protection (#5): skip private/internal URLs extracted from search results
    if (!validateExternalUrl(candidate).valid) continue;

    if (!seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
      if (urls.length >= limit) break;
    }
  }

  return urls;
}

async function crawlViaOfficialEndpoint(
  endpoint: string,
  urls: string[],
  options: NormalizeOptions = {}
): Promise<Crawl4AISearchResult[]> {
  // SSRF protection (#5): filter out private/internal URLs before fetching
  const safeUrls = filterSafeUrls(urls);
  if (safeUrls.length === 0) return [];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: safeUrls,
      browser_config: {
        type: 'BrowserConfig',
        params: { headless: true },
      },
      crawler_config: {
        type: 'CrawlerRunConfig',
        params: { cache_mode: 'bypass', stream: false },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) return [];
  const payload = await response.json();
  return normalizeResults(payload, options);
}

export async function crawl4aiSearch(query: string, limit = 3): Promise<Crawl4AISearchResult[]> {
  const endpoint = getEndpoint();
  if (!endpoint) return [];

  try {
    // Official Crawl4AI server mode: endpoint is /crawl and expects URLs.
    if (isCrawlEndpoint(endpoint)) {
      if (isHttpUrl(query)) {
        // SSRF protection (#5): validate user-provided URL before crawling
        const check = validateExternalUrl(query);
        if (!check.valid) {
          console.warn(`[ssrf] Blocked direct crawl query: ${query} — ${check.reason}`);
          return [];
        }
        return (await crawlViaOfficialEndpoint(endpoint, [query])).slice(0, limit);
      }

      // URL-seeding search without API keys: crawl DuckDuckGo HTML results first.
      const seedUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const seedResults = await crawlViaOfficialEndpoint(endpoint, [seedUrl], {
        allowDuckDuckGo: true,
        // Keep enough content for link extraction from the seed page.
        markdownLimit: 20_000,
      });
      if (seedResults.length === 0) return [];

      const candidateUrls = extractUrlsFromMarkdown(seedResults[0].markdown, limit);
      if (candidateUrls.length === 0) return [];

      const deepResults = await crawlViaOfficialEndpoint(endpoint, candidateUrls);
      return deepResults.slice(0, limit);
    }

    // Generic gateway mode: endpoint accepts {query, limit}.
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return [];
    const payload = await response.json();
    return normalizeResults(payload);
  } catch {
    return [];
  }
}

// Backward-compatible function alias for old imports.
export const firecrawlSearch = crawl4aiSearch;

export function isCrawl4AIAvailable(): boolean {
  return !!getEndpoint();
}

// Backward-compatible alias for old imports.
export const isFirecrawlAvailable = isCrawl4AIAvailable;
