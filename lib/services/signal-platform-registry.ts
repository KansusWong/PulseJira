import crypto from 'crypto';
import {
  fetchSubredditPosts,
  isRedditAvailable,
} from '@/connectors/external/reddit';
import {
  searchTweets,
  isTwitterAvailable,
} from '@/connectors/external/twitter';
import {
  searchVideos,
  isYouTubeAvailable,
} from '@/connectors/external/youtube';
import {
  crawl4aiSearch,
  isCrawl4AIAvailable,
} from '@/connectors/external/firecrawl';
import type {
  CollectedSignalItem,
  PreferenceSourceSeed,
  SignalSource,
} from './signal-source-types';

export interface SignalPlatformPreset {
  id: string;
  label: string;
  description: string;
  identifier: string;
  keywords?: string[];
}

export interface SignalPlatformDefinition {
  key: string;
  label: string;
  icon: string;
  color: string;
  sourcePlaceholder: string;
  sourceLabel: string;
  description: string;
  supportsAutoFromPreferences: boolean;
  envKeys: string[];
  presets?: SignalPlatformPreset[];
  isAvailable: () => boolean;
  collect: (source: SignalSource) => Promise<CollectedSignalItem[]>;
  buildAutoSources?: (
    topics: string[],
    platformSources: string[]
  ) => PreferenceSourceSeed[];
}

function sanitizeSubreddit(raw: string): string {
  return raw.replace(/^r\//i, '').replace(/\s+/g, '').trim();
}

function safeContent(title: string, body: string): string {
  return `${title}\n\n${body}`.trim().slice(0, 5000);
}

function hashExternalId(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function normalizeKeywords(keywords: Array<string | unknown>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const keyword of keywords || []) {
    const trimmed = String(keyword || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function buildGenericWebQuery(source: SignalSource): string {
  const config = source.config as Record<string, unknown> | undefined;
  const mode = String(config?.mode || '').trim().toLowerCase();
  const identifier = source.identifier.trim();

  if (mode === 'crawl4ai-site') {
    const configKeywords = Array.isArray(config?.query_hint_keywords)
      ? normalizeKeywords(config?.query_hint_keywords as unknown[])
      : [];
    const sourceKeywords = normalizeKeywords(source.keywords);

    const siteTokenMatch = identifier.match(/site:[^\s]+/i);
    const siteToken = siteTokenMatch?.[0] || '';
    const legacyTail = siteToken
      ? identifier.slice(identifier.indexOf(siteToken) + siteToken.length).trim()
      : '';
    const isLegacyPlatformName =
      !!legacyTail &&
      legacyTail.toLowerCase() === String(source.label || '').trim().toLowerCase();
    const legacyKeywords = isLegacyPlatformName ? '' : legacyTail;

    const keywordPart = [...sourceKeywords, ...configKeywords].join(' ').trim() || legacyKeywords;
    let siteScope = siteToken || identifier;
    if (!siteScope.startsWith('site:')) {
      const rawUrl = String(config?.url || '').trim();
      if (rawUrl) {
        try {
          const host = new URL(rawUrl).hostname.replace(/^www\./i, '');
          siteScope = `site:${host}`;
        } catch {
          // Fallback to identifier when config URL is malformed.
        }
      }
    }
    return [siteScope, keywordPart].filter(Boolean).join(' ').trim();
  }

  const keywordPart = normalizeKeywords(source.keywords).join(' ').trim();
  return [identifier, keywordPart].filter(Boolean).join(' ').trim();
}

const PLATFORM_DEFINITIONS: SignalPlatformDefinition[] = [
  {
    key: 'reddit',
    label: 'Reddit',
    icon: '\u{1F4AC}',
    color: 'orange',
    sourcePlaceholder: 'e.g. reactjs, programming, webdev',
    sourceLabel: 'Subreddits（可选覆盖）',
    description: '采集指定 subreddit 的热门帖子，适合开发者社区趋势跟踪。',
    supportsAutoFromPreferences: true,
    envKeys: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    isAvailable: () => isRedditAvailable(),
    collect: async (source) => {
      if (!isRedditAvailable()) return [];
      const subreddit = sanitizeSubreddit(source.identifier);
      if (!subreddit) return [];
      const posts = await fetchSubredditPosts(subreddit, {
        keywords: source.keywords,
        limit: 25,
        sort: 'hot',
      });
      return posts.map((post) => ({
        externalId: `reddit:${post.id}`,
        url: post.permalink,
        content: safeContent(post.title, post.selftext || ''),
        metadata: {
          author: post.author,
          subreddit: post.subreddit,
          score: post.score,
          num_comments: post.num_comments,
        },
      }));
    },
    buildAutoSources: (topics, platformSources) => {
      const subreddits = platformSources.length > 0 ? platformSources : ['programming'];
      return subreddits.map((sub) => ({
        idSuffix: sanitizeSubreddit(sub) || 'programming',
        identifier: sanitizeSubreddit(sub),
        label: `Reddit r/${sanitizeSubreddit(sub)} — Auto`,
        keywords: topics,
      }));
    },
  },
  {
    key: 'twitter',
    label: 'Twitter/X',
    icon: '\u{1F426}',
    color: 'sky',
    sourcePlaceholder: 'e.g. AI coding, LLM tools, developer productivity',
    sourceLabel: '搜索关键词（可选覆盖）',
    description: '采集 X/Twitter 实时讨论，适合热点和产品反馈监控。',
    supportsAutoFromPreferences: true,
    envKeys: ['TWITTER_BEARER_TOKEN'],
    isAvailable: () => isTwitterAvailable(),
    collect: async (source) => {
      if (!isTwitterAvailable()) return [];
      const query = source.keywords.length > 0
        ? source.keywords.join(' OR ')
        : source.identifier;
      if (!query.trim()) return [];
      const tweets = await searchTweets(query, { maxResults: 10 });
      return tweets.map((tweet) => ({
        externalId: `twitter:${tweet.id}`,
        url: tweet.url,
        content: tweet.text.trim().slice(0, 5000),
        metadata: {
          author: tweet.author_username || tweet.author_id,
          metrics: tweet.public_metrics,
        },
      }));
    },
    buildAutoSources: (topics, platformSources) => {
      const searchTerms = platformSources.length > 0 ? platformSources : topics;
      if (searchTerms.length === 0) return [];
      return [
        {
          idSuffix: 'auto',
          identifier: searchTerms.join(' OR '),
          label: 'Twitter — Auto',
          keywords: topics,
        },
      ];
    },
  },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: '\u{1F4F9}',
    color: 'red',
    sourcePlaceholder: 'e.g. coding assistant, AI dev tools',
    sourceLabel: '搜索关键词（可选覆盖）',
    description: '采集 YouTube 视频标题与描述，适合长内容趋势追踪。',
    supportsAutoFromPreferences: true,
    envKeys: ['YOUTUBE_API_KEY'],
    isAvailable: () => isYouTubeAvailable(),
    collect: async (source) => {
      if (!isYouTubeAvailable()) return [];
      const query = source.keywords.length > 0
        ? source.keywords.join(' ')
        : source.identifier;
      if (!query.trim()) return [];
      const videos = await searchVideos(query, { maxResults: 10 });
      return videos.map((video) => ({
        externalId: `youtube:${video.id}`,
        url: video.url,
        content: safeContent(video.title, video.description || ''),
        metadata: {
          channelTitle: video.channelTitle,
          channelId: video.channelId,
          publishedAt: video.publishedAt,
        },
      }));
    },
    buildAutoSources: (topics, platformSources) => {
      const searchTerms = platformSources.length > 0 ? platformSources : topics;
      if (searchTerms.length === 0) return [];
      return [
        {
          idSuffix: 'auto',
          identifier: searchTerms.join(' '),
          label: 'YouTube — Auto',
          keywords: topics,
        },
      ];
    },
  },
  {
    key: 'generic-web',
    label: 'Web/Crawl4AI',
    icon: '\u{1F310}',
    color: 'violet',
    sourcePlaceholder: 'e.g. site:producthunt.com AI code review tools',
    sourceLabel: '搜索表达式',
    description: '通用网页信号源，支持任意站点（通过 Crawl4AI 抓取并抽取摘要）。',
    supportsAutoFromPreferences: false,
    envKeys: ['CRAWL4AI_API_URL'],
    presets: [
      {
        id: 'xhs-hot',
        label: '小红书热点',
        description: '使用小红书站点搜索热点讨论',
        identifier: 'site:xiaohongshu.com 热点',
      },
      {
        id: 'bilibili-hot',
        label: 'Bilibili 热榜',
        description: '使用 B 站站点搜索趋势视频话题',
        identifier: 'site:bilibili.com 热门 观点',
      },
    ],
    isAvailable: () => isCrawl4AIAvailable(),
    collect: async (source) => {
      if (!isCrawl4AIAvailable()) return [];
      const query = buildGenericWebQuery(source);
      if (!query) return [];
      const items = await crawl4aiSearch(query, 8);
      return items.map((item) => ({
        externalId: `web:${hashExternalId(item.url)}`,
        url: item.url,
        content: safeContent(item.title || 'Web Signal', item.markdown || ''),
        metadata: {
          title: item.title,
          query,
        },
      }));
    },
  },
];

const DEFINITION_MAP = new Map(
  PLATFORM_DEFINITIONS.map((definition) => [definition.key, definition])
);

export function getSignalPlatformDefinitions(): SignalPlatformDefinition[] {
  return PLATFORM_DEFINITIONS;
}

export function getSignalPlatformDefinition(
  key: string
): SignalPlatformDefinition | undefined {
  return DEFINITION_MAP.get(key);
}

export function isSignalPlatformAvailable(key: string): boolean {
  const definition = getSignalPlatformDefinition(key);
  if (!definition) return false;
  return definition.isAvailable();
}

export function listSignalPlatformsForClient() {
  return getSignalPlatformDefinitions().map((definition) => ({
    key: definition.key,
    label: definition.label,
    icon: definition.icon,
    color: definition.color,
    sourcePlaceholder: definition.sourcePlaceholder,
    sourceLabel: definition.sourceLabel,
    description: definition.description,
    supportsAutoFromPreferences: definition.supportsAutoFromPreferences,
    envKeys: definition.envKeys,
    presets: definition.presets || [],
    available: definition.isAvailable(),
  }));
}
