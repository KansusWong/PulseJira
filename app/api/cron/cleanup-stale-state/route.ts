/**
 * Cron endpoint — cleans up stale intermediate state from the database.
 *
 * POST /api/cron/cleanup-stale-state
 *
 * Runs every 3 days (vercel.json schedule: 0 3 *​/3 * *).
 * Cleans three categories:
 *   1. Conversation-level intermediate state (field resets + disbanded teams)
 *   2. Project-level intermediate state (agent_logs, pipeline_checkpoint)
 *   3. Execution traces, blackboard entries, tool approval audits
 *
 * Safety: skips active conversations (architect running, project analyzing/implementing).
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export const maxDuration = 60;

const STALE_DAYS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function setConfigValue(key: string, value: unknown): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('system_config')
    .upsert(
      { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
}

async function isCleanupEnabled(): Promise<boolean> {
  const val = await getConfigValue('stale_cleanup_enabled');
  // Default enabled when key doesn't exist
  if (val === undefined || val === null) return true;
  return val === true || val === 'true';
}

/**
 * Returns true if last run was less than 24 hours ago (idempotency guard).
 */
async function wasRecentlyRun(): Promise<boolean> {
  const lastRun = await getConfigValue('stale_cleanup_last_run');
  if (typeof lastRun !== 'string' || !lastRun) return false;
  const lastTime = new Date(lastRun).getTime();
  if (Number.isNaN(lastTime)) return false;
  return Date.now() - lastTime < 24 * 3600_000;
}

// ---------------------------------------------------------------------------
// Cleanup functions
// ---------------------------------------------------------------------------

interface CleanupStats {
  conversationsReset: number;
  teamsDeleted: number;
  projectsReset: number;
  tracesDeleted: number;
  blackboardDeleted: number;
  toolAuditsDeleted: number;
}

function cutoffDate(): string {
  return new Date(Date.now() - STALE_DAYS * 24 * 3600_000).toISOString();
}

/**
 * 1a. Reset intermediate fields on inactive conversations.
 * Excludes conversations with architect_phase_status = 'running'
 * and conversations linked to projects in analyzing/implementing status.
 */
async function cleanupConversationState(cutoff: string): Promise<number> {
  // Step 1: find conversation IDs linked to active projects so we can exclude them.
  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id')
    .in('status', ['analyzing', 'implementing']);

  const activeProjectIds = activeProjects?.map((p: { id: string }) => p.id) ?? [];

  const { data: activeProjectConvos } = activeProjectIds.length > 0
    ? await supabase
        .from('conversations')
        .select('id')
        .in('project_id', activeProjectIds)
    : { data: [] };

  const excludeIds = new Set(activeProjectConvos?.map((c: { id: string }) => c.id) ?? []);

  // Step 2: reset intermediate fields on stale, inactive conversations.
  let query = supabase
    .from('conversations')
    .update({
      dm_decision: null,
      dm_approval_status: null,
      architect_checkpoint: null,
      architect_result: null,
      architect_phase_status: null,
      structured_requirements: null,
      pending_tool_approval: null,
      clarification_context: null,
      clarification_round: 0,
      complexity_assessment: null,
    })
    .lt('updated_at', cutoff)
    .not('architect_phase_status', 'eq', 'running');

  if (excludeIds.size > 0) {
    // Supabase .not('id','in','(...)') excludes these IDs
    const idList = `(${[...excludeIds].join(',')})`;
    query = query.not('id', 'in', idList);
  }

  const { data, error } = await query.select('id');

  if (error) {
    console.error('[cleanup] conversationState error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * 1b. Delete disbanded agent teams older than cutoff.
 * Cascade deletes agent_mailbox and team_tasks.
 */
async function cleanupDisbandedTeams(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('agent_teams')
    .delete()
    .eq('status', 'disbanded')
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.error('[cleanup] disbandedTeams error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * 2. Reset project-level intermediate state.
 * Preserves prepare_result, plan_result, implement_result.
 */
async function cleanupProjectState(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('projects')
    .update({
      agent_logs: null,
      pipeline_checkpoint: null,
    })
    .lt('updated_at', cutoff)
    .not('status', 'in', '("analyzing","implementing")')
    .select('id');

  if (error) {
    console.error('[cleanup] projectState error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * 3a. Delete completed/failed execution traces older than cutoff.
 * Cascade deletes execution_events.
 */
async function cleanupExecutionTraces(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('execution_traces')
    .delete()
    .in('status', ['completed', 'failed'])
    .lt('completed_at', cutoff)
    .select('trace_id');

  if (error) {
    console.error('[cleanup] executionTraces error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * 3b. Delete stale blackboard entries.
 */
async function cleanupBlackboard(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('blackboard_entries')
    .delete()
    .lt('updated_at', cutoff)
    .select('id');

  if (error) {
    console.error('[cleanup] blackboard error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * 3c. Delete old tool approval audits.
 */
async function cleanupToolApprovalAudits(cutoff: string): Promise<number> {
  const { data, error } = await supabase
    .from('tool_approval_audits')
    .delete()
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.error('[cleanup] toolApprovalAudits error:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!supabaseConfigured) {
    return NextResponse.json({
      success: true,
      data: { mode: 'skipped', message: 'Supabase not configured.' },
    });
  }

  // Kill switch
  const enabled = await isCleanupEnabled();
  if (!enabled) {
    return NextResponse.json({
      success: true,
      data: { mode: 'disabled', message: 'Stale cleanup is disabled via system config.' },
    });
  }

  // Idempotency: skip if already ran within 24h
  const recent = await wasRecentlyRun();
  if (recent) {
    return NextResponse.json({
      success: true,
      data: { mode: 'skipped', message: 'Cleanup already ran within the last 24 hours.' },
    });
  }

  const cutoff = cutoffDate();

  const stats: CleanupStats = {
    conversationsReset: await cleanupConversationState(cutoff),
    teamsDeleted: await cleanupDisbandedTeams(cutoff),
    projectsReset: await cleanupProjectState(cutoff),
    tracesDeleted: await cleanupExecutionTraces(cutoff),
    blackboardDeleted: await cleanupBlackboard(cutoff),
    toolAuditsDeleted: await cleanupToolApprovalAudits(cutoff),
  };

  // Record last run time
  await setConfigValue('stale_cleanup_last_run', new Date().toISOString());

  console.log('[cron/cleanup-stale-state] Completed:', stats);

  return NextResponse.json({
    success: true,
    data: { mode: 'completed', stats },
  });
}

// Vercel Cron uses GET by default
export async function GET(req: Request) {
  return POST(req);
}
