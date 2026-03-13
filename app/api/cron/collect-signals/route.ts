/**
 * Cron endpoint — triggers signal collection from all active sources.
 *
 * POST /api/cron/collect-signals
 *
 * Can be called by:
 * - Vercel Cron (vercel.json schedule: every hour; internally skips if interval not reached)
 * - External scheduler (e.g. GitHub Actions, cron job)
 * - Manual trigger from the UI
 *
 * Chat-First redesign changes:
 * - Checks system_config.signal_collection_enabled before collecting
 * - Limits per-platform collection (default 5 items)
 * - Simplified processing: stores as DRAFT, lightweight screening only
 */

import { NextResponse } from 'next/server';
import { collectAll } from '@/lib/services/signal-collector';
import { generateDemoSignals, isDemoMode, demoSignalStore } from '@/lib/services/demo-signals';
import { supabase, supabaseConfigured } from '@/lib/db/client';

/**
 * Check if signal collection is enabled via system_config.
 */
async function isCollectionEnabled(): Promise<boolean> {
  if (!supabaseConfigured) return true; // Default enabled if no DB
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'signal_collection_enabled')
      .single();
    if (data) {
      const val = JSON.parse(data.value);
      return val === true || val === 'true';
    }
  } catch {
    // Fallback to enabled
  }
  return true;
}

/**
 * Read a single system_config value by key. Returns undefined if not found.
 */
async function getConfigValue(key: string): Promise<unknown | undefined> {
  if (!supabaseConfigured) return undefined;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', key)
      .single();
    if (data) return JSON.parse(data.value);
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Write a single system_config value by key (upsert).
 */
async function setConfigValue(key: string, value: unknown): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('system_config')
    .upsert(
      { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

/**
 * Check whether enough time has elapsed since the last collection.
 * Returns { due: true } if collection should proceed, or { due: false, ... } with skip info.
 */
async function isCollectionDue(): Promise<
  | { due: true }
  | { due: false; intervalHours: number; lastCollectedAt: string; nextDueAt: string }
> {
  const intervalRaw = await getConfigValue('signal_fetch_interval_hours');
  const intervalHours = typeof intervalRaw === 'number' && intervalRaw >= 1 ? intervalRaw : 5;

  const lastRaw = await getConfigValue('signal_last_collected_at');
  if (typeof lastRaw !== 'string' || !lastRaw) {
    return { due: true }; // Never collected before
  }

  const lastTime = new Date(lastRaw).getTime();
  if (Number.isNaN(lastTime)) {
    return { due: true }; // Invalid date, treat as never collected
  }

  const nextDue = lastTime + intervalHours * 3600_000;
  if (Date.now() >= nextDue) {
    return { due: true };
  }

  return {
    due: false,
    intervalHours,
    lastCollectedAt: lastRaw,
    nextDueAt: new Date(nextDue).toISOString(),
  };
}

export async function POST(req: Request) {
  // Optional auth check for cron endpoints
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Check system-level kill switch
  const enabled = await isCollectionEnabled();
  if (!enabled) {
    return NextResponse.json({
      success: true,
      data: {
        mode: 'disabled',
        is_demo: false,
        message: 'Signal collection is disabled via system config.',
        collection: { collected: 0, duplicates: 0, errors: 0 },
        processing: { processed: 0, projectsCreated: 0, rejected: 0, errors: 0 },
      },
    });
  }

  // Check if enough time has elapsed since the last collection
  const dueCheck = await isCollectionDue();
  if (!dueCheck.due) {
    return NextResponse.json({
      success: true,
      data: {
        mode: 'skipped',
        is_demo: false,
        message: `Collection skipped — next due at ${dueCheck.nextDueAt} (interval: ${dueCheck.intervalHours}h, last: ${dueCheck.lastCollectedAt}).`,
        collection: { collected: 0, duplicates: 0, errors: 0 },
        processing: { processed: 0, projectsCreated: 0, rejected: 0, errors: 0 },
      },
    });
  }

  const demoMode = isDemoMode();

  // Live mode: never auto-fallback to demo data.
  if (!demoMode) {
    try {
      const collectResult = await collectAll();

      // Record the successful collection timestamp
      await setConfigValue('signal_last_collected_at', new Date().toISOString());

      return NextResponse.json({
        success: true,
        data: {
          mode: 'live',
          is_demo: false,
          collection: collectResult,
          processing: { processed: 0, projectsCreated: 0, rejected: 0, errors: 0 },
          message:
            collectResult.collected > 0
              ? undefined
              : 'No new live signals collected from configured sources.',
        },
      });
    } catch (error: any) {
      console.error('[cron/collect-signals] Live collection error:', error.message);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          data: {
            mode: 'live',
            is_demo: false,
            collection: { collected: 0, duplicates: 0, errors: 1 },
            processing: { processed: 0, projectsCreated: 0, rejected: 0, errors: 1 },
            message: 'Live collection failed. Demo fallback is disabled.',
          },
        },
        { status: 500 }
      );
    }
  }

  // Demo mode only: generate mock signals for local/dev exploration.
  const newSignals = generateDemoSignals(3);
  const existing = new Set(demoSignalStore.map((s) => s.content));
  const fresh = newSignals.filter((s) => !existing.has(s.content));
  demoSignalStore.unshift(...fresh);

  // Record the successful collection timestamp
  await setConfigValue('signal_last_collected_at', new Date().toISOString());

  return NextResponse.json({
    success: true,
    data: {
      mode: 'demo',
      is_demo: true,
      message: 'Demo mode is enabled. Returned signals are mock data.',
      collection: { collected: fresh.length, duplicates: newSignals.length - fresh.length, errors: 0 },
      processing: { processed: 0, projectsCreated: 0, rejected: 0, errors: 0 },
    },
  });
}

// Also support GET for Vercel Cron (which uses GET by default)
export async function GET(req: Request) {
  return POST(req);
}
