/**
 * YouTube external connector — fetches videos via YouTube Data API v3.
 *
 * Requires: YOUTUBE_API_KEY env var.
 */

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  url: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
}

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY || null;
}

/**
 * Search YouTube for videos matching a query.
 */
export async function searchVideos(
  query: string,
  options: { maxResults?: number; publishedAfter?: string } = {}
): Promise<YouTubeVideo[]> {
  const key = apiKey();
  if (!key) return [];

  const { maxResults = 10, publishedAfter } = options;

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(maxResults),
      order: 'relevance',
      key,
    });
    if (publishedAfter) {
      params.set('publishedAfter', publishedAfter);
    }

    const res = await fetch(`${API_BASE}/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description?.slice(0, 1000) || '',
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnailUrl: item.snippet.thumbnails?.default?.url,
    }));
  } catch (error: any) {
    console.error('[youtube] Search failed:', error.message);
    return [];
  }
}

/**
 * Fetch recent videos from a specific channel.
 */
export async function fetchChannelVideos(
  channelId: string,
  options: { maxResults?: number } = {}
): Promise<YouTubeVideo[]> {
  const key = apiKey();
  if (!key) return [];

  const { maxResults = 10 } = options;

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      channelId,
      type: 'video',
      maxResults: String(maxResults),
      order: 'date',
      key,
    });

    const res = await fetch(`${API_BASE}/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description?.slice(0, 1000) || '',
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnailUrl: item.snippet.thumbnails?.default?.url,
    }));
  } catch (error: any) {
    console.error('[youtube] fetchChannelVideos failed:', error.message);
    return [];
  }
}

export function isYouTubeAvailable(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}
