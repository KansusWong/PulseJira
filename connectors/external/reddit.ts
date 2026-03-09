/**
 * Reddit external connector — fetches posts from subreddits via Reddit API.
 *
 * Requires: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET env vars.
 * Uses OAuth2 "Application Only" flow (no user login needed).
 */

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'User-Agent': 'RebuilD/1.0',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.value;
  } catch (error: any) {
    console.error('[reddit] Failed to get access token:', error.message);
    return null;
  }
}

/**
 * Fetch recent posts from a subreddit, optionally filtered by keywords.
 */
export async function fetchSubredditPosts(
  subreddit: string,
  options: { keywords?: string[]; limit?: number; sort?: 'hot' | 'new' | 'top' } = {}
): Promise<RedditPost[]> {
  const { keywords = [], limit = 25, sort = 'hot' } = options;
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const res = await fetch(
      `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'RebuilD/1.0',
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const children: any[] = data?.data?.children || [];

    let posts: RedditPost[] = children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      selftext: c.data.selftext?.slice(0, 2000) || '',
      url: c.data.url,
      permalink: `https://reddit.com${c.data.permalink}`,
      author: c.data.author,
      subreddit: c.data.subreddit,
      score: c.data.score,
      num_comments: c.data.num_comments,
      created_utc: c.data.created_utc,
    }));

    // Filter by keywords if provided
    if (keywords.length > 0) {
      const lowerKeywords = keywords.map((k) => k.toLowerCase());
      posts = posts.filter((p) => {
        const text = `${p.title} ${p.selftext}`.toLowerCase();
        return lowerKeywords.some((kw) => text.includes(kw));
      });
    }

    return posts;
  } catch (error: any) {
    console.error('[reddit] Failed to fetch subreddit posts:', error.message);
    return [];
  }
}

/**
 * Search Reddit for posts matching a query.
 */
export async function searchReddit(
  query: string,
  options: { limit?: number; subreddit?: string } = {}
): Promise<RedditPost[]> {
  const { limit = 10, subreddit } = options;
  const token = await getAccessToken();
  if (!token) return [];

  const base = subreddit
    ? `https://oauth.reddit.com/r/${subreddit}/search`
    : 'https://oauth.reddit.com/search';

  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      sort: 'relevance',
      t: 'week',
      restrict_sr: subreddit ? 'true' : 'false',
    });

    const res = await fetch(`${base}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RebuilD/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const children: any[] = data?.data?.children || [];

    return children.map((c: any) => ({
      id: c.data.id,
      title: c.data.title,
      selftext: c.data.selftext?.slice(0, 2000) || '',
      url: c.data.url,
      permalink: `https://reddit.com${c.data.permalink}`,
      author: c.data.author,
      subreddit: c.data.subreddit,
      score: c.data.score,
      num_comments: c.data.num_comments,
      created_utc: c.data.created_utc,
    }));
  } catch (error: any) {
    console.error('[reddit] Search failed:', error.message);
    return [];
  }
}

export function isRedditAvailable(): boolean {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}
