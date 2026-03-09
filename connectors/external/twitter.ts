/**
 * Twitter/X external connector — fetches tweets via Twitter API v2.
 *
 * Requires: TWITTER_BEARER_TOKEN env var.
 */

export interface Tweet {
  id: string;
  text: string;
  author_id: string;
  author_username?: string;
  created_at: string;
  url: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    impression_count: number;
  };
}

const API_BASE = 'https://api.twitter.com/2';

function authHeaders(): Record<string, string> | null {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'RebuilD/1.0',
  };
}

/**
 * Search recent tweets (last 7 days) matching a query.
 */
export async function searchTweets(
  query: string,
  options: { maxResults?: number } = {}
): Promise<Tweet[]> {
  const { maxResults = 10 } = options;
  const headers = authHeaders();
  if (!headers) return [];

  try {
    const params = new URLSearchParams({
      query: `${query} -is:retweet`,
      max_results: String(Math.min(Math.max(maxResults, 10), 100)),
      'tweet.fields': 'created_at,public_metrics,author_id',
      expansions: 'author_id',
      'user.fields': 'username',
    });

    const res = await fetch(`${API_BASE}/tweets/search/recent?${params}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[twitter] Search API returned ${res.status}: ${body.slice(0, 300)}`);
      return [];
    }
    const data = await res.json();
    if (!data.data) return [];

    // Build author lookup
    const users = new Map<string, string>();
    for (const u of data.includes?.users || []) {
      users.set(u.id, u.username);
    }

    return data.data.map((t: any) => ({
      id: t.id,
      text: t.text,
      author_id: t.author_id,
      author_username: users.get(t.author_id),
      created_at: t.created_at,
      url: `https://x.com/i/status/${t.id}`,
      public_metrics: t.public_metrics,
    }));
  } catch (error: any) {
    console.error('[twitter] Search failed:', error.message);
    return [];
  }
}

/**
 * Get recent tweets from a specific user.
 */
export async function getUserTweets(
  username: string,
  options: { maxResults?: number } = {}
): Promise<Tweet[]> {
  const { maxResults = 10 } = options;
  const headers = authHeaders();
  if (!headers) return [];

  try {
    // Step 1: Resolve username to user ID
    const userRes = await fetch(`${API_BASE}/users/by/username/${username}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!userRes.ok) {
      console.error(`[twitter] User lookup returned ${userRes.status} for @${username}`);
      return [];
    }
    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) return [];

    // Step 2: Fetch user's tweets
    const params = new URLSearchParams({
      max_results: String(Math.min(Math.max(maxResults, 5), 100)),
      'tweet.fields': 'created_at,public_metrics',
      exclude: 'retweets,replies',
    });

    const res = await fetch(`${API_BASE}/users/${userId}/tweets?${params}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[twitter] User tweets API returned ${res.status} for user ${userId}`);
      return [];
    }
    const data = await res.json();
    if (!data.data) return [];

    return data.data.map((t: any) => ({
      id: t.id,
      text: t.text,
      author_id: userId,
      author_username: username,
      created_at: t.created_at,
      url: `https://x.com/${username}/status/${t.id}`,
      public_metrics: t.public_metrics,
    }));
  } catch (error: any) {
    console.error('[twitter] getUserTweets failed:', error.message);
    return [];
  }
}

export function isTwitterAvailable(): boolean {
  return !!process.env.TWITTER_BEARER_TOKEN;
}
