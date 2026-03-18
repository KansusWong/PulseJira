/**
 * Server-side user preferences store.
 *
 * Persists signal-collection preferences to Supabase `user_preferences` table.
 * Uses an in-memory cache to avoid hitting the DB on every read; the cache is
 * populated lazily on first access and refreshed on every write.
 */

import { supabase } from '../db/client';
import {
  getSignalPlatformDefinitions,
  isSignalPlatformAvailable,
} from './signal-platform-registry';
import type { SignalSource } from './signal-source-types';

export interface PlatformConfig {
  enabled: boolean;
  sources: string[];
}

export type AgentExecutionMode = 'simple' | 'medium' | 'advanced';
export type TrustLevel = 'auto' | 'standard' | 'collaborative';

export interface UserPreferences {
  topics: string[];
  platforms: Record<string, PlatformConfig>;
  agentExecutionMode: AgentExecutionMode;
  trustLevel: TrustLevel;
  updatedAt: string;
}

function defaultPlatformConfig(): PlatformConfig {
  return { enabled: true, sources: [] };
}

function buildDefaultPlatformMap(): Record<string, PlatformConfig> {
  const map: Record<string, PlatformConfig> = {};
  for (const definition of getSignalPlatformDefinitions()) {
    if (definition.supportsAutoFromPreferences) {
      map[definition.key] = defaultPlatformConfig();
    }
  }
  return map;
}

function normalizePlatformConfig(value: any): PlatformConfig {
  const enabled = typeof value?.enabled === 'boolean' ? value.enabled : true;
  const sources = Array.isArray(value?.sources)
    ? value.sources
      .map((item: unknown) => String(item || '').trim())
      .filter(Boolean)
    : [];
  return { enabled, sources };
}

const DEFAULT_PREFERENCES: UserPreferences = {
  topics: [],
  platforms: buildDefaultPlatformMap(),
  agentExecutionMode: 'simple',
  trustLevel: 'standard',
  updatedAt: new Date().toISOString(),
};

const USER_ID = 'default';

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: UserPreferences | null = null;
let cachePromise: Promise<UserPreferences> | null = null;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function loadFromDB(): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('topics, platforms, agent_execution_mode, trust_level, updated_at')
      .eq('user_id', USER_ID)
      .single();

    if (error || !data) {
      return { ...DEFAULT_PREFERENCES };
    }

    const rawPlatforms = (data.platforms as Record<string, any>) || {};
    const normalizedPlatforms: Record<string, PlatformConfig> = {
      ...buildDefaultPlatformMap(),
    };

    for (const [platformKey, platformValue] of Object.entries(rawPlatforms)) {
      normalizedPlatforms[platformKey] = normalizePlatformConfig(platformValue);
    }

    const rawMode = data.agent_execution_mode;
    const agentExecutionMode: AgentExecutionMode =
      rawMode === 'simple' || rawMode === 'medium' || rawMode === 'advanced'
        ? rawMode
        : 'simple';

    const rawTrust = data.trust_level;
    const trustLevel: TrustLevel =
      rawTrust === 'auto' || rawTrust === 'standard' || rawTrust === 'collaborative'
        ? rawTrust
        : 'standard';

    return {
      topics: Array.isArray(data.topics) ? data.topics : [],
      platforms: normalizedPlatforms,
      agentExecutionMode,
      trustLevel,
      updatedAt: data.updated_at ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error('[preferences-store] Failed to load from DB, using defaults:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

async function saveToDB(prefs: UserPreferences): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: USER_ID,
          topics: prefs.topics,
          platforms: prefs.platforms,
          agent_execution_mode: prefs.agentExecutionMode || 'simple',
          trust_level: prefs.trustLevel || 'standard',
          updated_at: prefs.updatedAt,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[preferences-store] Failed to save to DB:', error.message);
    }
  } catch (err) {
    console.error('[preferences-store] saveToDB exception:', err);
  }
}

async function loadFromDBScoped(userId: string, orgId: string): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();

    if (error || !data?.preferences) {
      return { ...DEFAULT_PREFERENCES };
    }

    const raw = data.preferences as any;
    return {
      topics: Array.isArray(raw.topics) ? raw.topics : [],
      platforms: raw.platforms || buildDefaultPlatformMap(),
      agentExecutionMode: raw.agentExecutionMode || 'simple',
      trustLevel: raw.trustLevel || 'standard',
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[preferences-store] Failed to load scoped prefs:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

async function saveToDBScoped(userId: string, orgId: string, prefs: UserPreferences): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          preferences: prefs,
          updated_at: prefs.updatedAt,
        },
        { onConflict: 'user_id,org_id' }
      );
    if (error) {
      console.error('[preferences-store] Failed to save scoped prefs:', error.message);
    }
  } catch (err) {
    console.error('[preferences-store] saveToDBScoped exception:', err);
  }
}

// ---------------------------------------------------------------------------
// Public API (now async)
// ---------------------------------------------------------------------------

export async function getPreferences(userId?: string, orgId?: string): Promise<UserPreferences> {
  // If userId/orgId provided, load per-user per-org prefs (no cache for now)
  if (userId && orgId) {
    return loadFromDBScoped(userId, orgId);
  }
  // Legacy path: global singleton
  if (cache) return { ...cache };
  if (!cachePromise) {
    cachePromise = loadFromDB().then(data => { cache = data; cachePromise = null; return data; });
  }
  const result = await cachePromise;
  return { ...result };
}

export async function setPreferences(patch: Partial<UserPreferences>, userId?: string, orgId?: string): Promise<UserPreferences> {
  const current = await getPreferences(userId, orgId);

  const nextPlatforms: Record<string, PlatformConfig> = {
    ...current.platforms,
  };

  if (patch.platforms && typeof patch.platforms === 'object') {
    for (const [platformKey, platformConfig] of Object.entries(patch.platforms)) {
      nextPlatforms[platformKey] = normalizePlatformConfig(platformConfig);
    }
  }

  const updated: UserPreferences = {
    ...current,
    ...patch,
    platforms: nextPlatforms,
    updatedAt: new Date().toISOString(),
  };

  if (userId && orgId) {
    await saveToDBScoped(userId, orgId, updated);
  } else {
    await saveToDB(updated);
    cache = updated;
  }

  return { ...updated };
}

/**
 * Check which platform API keys are available.
 */
export function getAvailablePlatforms() {
  const result: Record<string, boolean> = {};
  for (const definition of getSignalPlatformDefinitions()) {
    result[definition.key] = isSignalPlatformAvailable(definition.key);
  }
  return result;
}

/**
 * Convert user preferences into SignalSource objects for the collector.
 * Used when the signal_sources table is empty.
 *
 * Strategy: when topics are set, automatically enable every platform whose
 * API key is configured. Platform-specific keywords (sources) override
 * global topics as search terms; the manual `enabled` toggle is kept as an
 * opt-out mechanism — only platforms explicitly disabled by the user are
 * skipped.
 */
export async function preferencesToSources(): Promise<SignalSource[]> {
  const prefs = await getPreferences();
  const sources: SignalSource[] = [];
  const now = new Date().toISOString();

  if (prefs.topics.length === 0) return sources;

  for (const definition of getSignalPlatformDefinitions()) {
    if (!definition.supportsAutoFromPreferences) continue;
    if (!isSignalPlatformAvailable(definition.key)) continue;

    const config = prefs.platforms[definition.key] || defaultPlatformConfig();
    if (config.enabled === false) continue;
    const autoSeeds = definition.buildAutoSources
      ? definition.buildAutoSources(prefs.topics, config.sources || [])
      : [];

    for (const seed of autoSeeds) {
      const seedSuffix = String(seed.idSuffix || 'auto')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');

      sources.push({
        id: `pref-${definition.key}-${seedSuffix || 'auto'}`,
        platform: definition.key,
        identifier: seed.identifier,
        label: seed.label,
        keywords: seed.keywords,
        interval_minutes: seed.intervalMinutes || 60,
        active: true,
        last_fetched_at: null,
        created_at: now,
      });
    }
  }

  return sources;
}
