/**
 * Signal Collector Service — fetches ideas from external platforms.
 *
 * Uses platform adapters from the platform registry.
 * Deduplicates against existing signals by content hash/external_id.
 * Stores new signals via the RAG module (with embeddings).
 */

import crypto from 'crypto';
import { supabase } from '../db/client';
import { storeSignal } from './rag';
import { preferencesToSources } from './preferences-store';
import {
  getSignalPlatformDefinition,
  isSignalPlatformAvailable,
} from './signal-platform-registry';
import type {
  CollectedSignalItem,
  SignalSource,
} from './signal-source-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectResult {
  collected: number;
  duplicates: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function isDuplicate(hash: string, externalId?: string): Promise<boolean> {
  // Check by content hash
  const { data, error } = await supabase
    .from('signals')
    .select('id')
    .eq('content_hash', hash)
    .limit(1);

  if (error) {
    console.error('[signal-collector] isDuplicate hash query error:', error.message);
    return false; // Fail open — better to re-insert than to block collection
  }

  if (data && data.length > 0) return true;

  // Check by external ID if provided
  if (externalId) {
    const { data: byExt, error: extErr } = await supabase
      .from('signals')
      .select('id')
      .eq('external_id', externalId)
      .limit(1);

    if (extErr) {
      console.error('[signal-collector] isDuplicate external_id query error:', extErr.message);
      return false;
    }

    if (byExt && byExt.length > 0) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Collector core
// ---------------------------------------------------------------------------

async function persistCollectedItem(
  source: SignalSource,
  item: CollectedSignalItem,
  result: CollectResult
): Promise<void> {
  const normalized = (item.content || '').trim();
  if (!normalized) {
    result.errors++;
    return;
  }

  const hash = contentHash(normalized);
  if (await isDuplicate(hash, item.externalId)) {
    result.duplicates++;
    return;
  }

  const signal = await storeSignal(item.url, normalized);
  if (!signal) {
    result.errors++;
    return;
  }

  const isPrefSource = source.id.startsWith('pref-');
  await supabase
    .from('signals')
    .update({
      ...(isPrefSource ? {} : { source_id: source.id }),
      external_id: item.externalId || null,
      external_url: item.url,
      content_hash: hash,
      platform: source.platform,
      metadata: {
        source_identifier: source.identifier,
        source_label: source.label,
        ...(item.metadata || {}),
      },
    })
    .eq('id', signal.id);

  result.collected++;
}

async function collectFromSourceInternal(source: SignalSource): Promise<CollectResult> {
  const result: CollectResult = { collected: 0, duplicates: 0, errors: 0 };
  const definition = getSignalPlatformDefinition(source.platform);

  if (!definition) {
    console.warn(`[signal-collector] Unknown platform: ${source.platform}`);
    result.errors++;
    return result;
  }

  if (!isSignalPlatformAvailable(source.platform)) {
    return result;
  }

  let items: CollectedSignalItem[] = [];
  try {
    items = await definition.collect(source);
  } catch (error: any) {
    console.error(
      `[signal-collector] ${source.platform} adapter error for "${source.identifier}":`,
      error.message
    );
    result.errors++;
    return result;
  }

  for (const item of items) {
    await persistCollectedItem(source, item, result);
  }

  return result;
}

function dedupeSources(
  dbSources: SignalSource[],
  preferenceSources: SignalSource[]
): SignalSource[] {
  const byKey = new Map<string, SignalSource>();

  for (const source of dbSources) {
    byKey.set(`${source.platform}::${source.identifier}`.toLowerCase(), source);
  }

  for (const source of preferenceSources) {
    const key = `${source.platform}::${source.identifier}`.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, source);
  }

  return Array.from(byKey.values());
}

/**
 * Fetch active explicit signal sources and auto sources from user preferences.
 * Runs collection through platform adapter registry.
 */
export async function collectAll(): Promise<CollectResult> {
  const total: CollectResult = { collected: 0, duplicates: 0, errors: 0 };

  const { data: dbSources, error } = await supabase
    .from('signal_sources')
    .select('*')
    .eq('active', true);

  if (error) {
    console.error('[signal-collector] Failed to query signal_sources:', error.message);
  }

  const prefSources = await preferencesToSources();
  const explicitSources = (dbSources || []) as SignalSource[];
  const effectiveSources = dedupeSources(explicitSources, prefSources);

  if (effectiveSources.length === 0) {
    console.warn('[signal-collector] No signal sources configured');
    return total;
  }

  for (const source of effectiveSources) {
    console.log(`[signal-collector] Collecting from ${source.platform}:${source.identifier}...`);
    const result = await collectFromSourceInternal(source);

    total.collected += result.collected;
    total.duplicates += result.duplicates;
    total.errors += result.errors;

    // Update last_fetched_at only for persisted DB sources.
    if (!source.id.startsWith('pref-')) {
      await supabase
        .from('signal_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id);
    }
  }

  console.log(
    `[signal-collector] Done: ${total.collected} new, ${total.duplicates} dupes, ${total.errors} errors`
  );
  return total;
}

/**
 * Collect from a single source by ID.
 */
export async function collectFromSource(sourceId: string): Promise<CollectResult> {
  const { data: source, error } = await supabase
    .from('signal_sources')
    .select('*')
    .eq('id', sourceId)
    .single();

  if (error || !source) {
    return { collected: 0, duplicates: 0, errors: 1 };
  }

  if (!getSignalPlatformDefinition(source.platform)) {
    return { collected: 0, duplicates: 0, errors: 1 };
  }

  const result = await collectFromSourceInternal(source as SignalSource);

  await supabase
    .from('signal_sources')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', sourceId);

  return result;
}
