/**
 * POST /api/projects/reconcile — Fix stale project statuses after server restart.
 *
 * Finds projects stuck in transient states ("implementing", "active") with no
 * live agent process, and resets them to the appropriate settled state based on
 * what data they actually have.
 *
 * Called once by the frontend on initial page load.
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

const TRANSIENT_STATUSES = ['implementing', 'active'];

export async function POST() {
  try {
    assertSupabase();
    const { data: stale, error } = await supabase
      .from('projects')
      .select('id, status, plan_result, implement_result')
      .in('status', TRANSIENT_STATUSES);

    if (error) {
      console.error('[reconcile] Query error:', error);
      return errorResponse(error.message, 500);
    }

    if (!stale || stale.length === 0) {
      return NextResponse.json({ success: true, reconciled: 0 });
    }

    let reconciled = 0;

    for (const project of stale) {
      try {
        let newStatus: string;

        if (project.implement_result) {
          newStatus = 'implemented';
        } else if (project.plan_result) {
          newStatus = 'planned';
        } else {
          newStatus = 'draft';
        }

        if (newStatus !== project.status) {
          await supabase
            .from('projects')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', project.id);
          reconciled++;
          console.log(`[reconcile] ${project.id}: ${project.status} → ${newStatus}`);
        }
      } catch (e: any) {
        console.error(`[reconcile] Failed to reconcile project ${project.id}:`, e);
      }
    }

    // Also clean up any agent_runs stuck in "running"
    try {
      await supabase
        .from('agent_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('status', 'running');
    } catch (e: any) {
      console.error('[reconcile] Failed to clean up agent_runs:', e);
    }

    return NextResponse.json({ success: true, reconciled });
  } catch (e: any) {
    console.error('[API Error] POST /api/projects/reconcile:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
