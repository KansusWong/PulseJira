/**
 * GET  /api/conversations/[id]/plan — get plan/assessment data
 * POST /api/conversations/[id]/plan — approve or reject plan
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { chatEngine } from '@/lib/services/chat-engine';
import { toolApprovalService } from '@/lib/services/tool-approval';
import { compactionUpgradeService } from '@/lib/services/compaction-upgrade';
import { makeSSEResponseFromGenerator } from '@/lib/utils/api-error';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: null });
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('complexity_assessment, execution_mode, dm_decision, dm_approval_status')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    // Return empty data instead of 404 — the conversation may not yet
    // be persisted (frontend creates the ID optimistically).
    return NextResponse.json({ success: true, data: null });
  }

  return NextResponse.json({
    success: true,
    data: {
      assessment: data.complexity_assessment,
      execution_mode: data.execution_mode,
      dm_decision: data.dm_decision,
      dm_approval_status: data.dm_approval_status,
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { action } = body; // 'approve' | 'reject' | 'modify'

  // All legacy plan/DM/architect actions now route through handleMessage
  // which sends everything to RebuilD.
  if (['approve', 'confirm_requirements', 'approve_dm', 'start_dm_review', 'resume_architect'].includes(action)) {
    const userMessage = body.requirements?.summary || body.message || 'Please continue with the approved plan.';
    return makeSSEResponseFromGenerator(
      chatEngine.handleMessage(params.id, userMessage),
      { signal: req.signal },
    );
  }

  if (action === 'reject') {
    if (supabaseConfigured) {
      await supabase
        .from('conversations')
        .update({
          complexity_assessment: null,
          execution_mode: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }
    return NextResponse.json({ success: true, data: { status: 'rejected' } });
  }

  if (action === 'reject_dm') {
    if (supabaseConfigured) {
      await supabase
        .from('conversations')
        .update({
          dm_approval_status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }
    return NextResponse.json({ success: true, data: { status: 'rejected' } });
  }

  if (action === 'approve_tool') {
    const { approval_id } = body;
    if (!approval_id) {
      return NextResponse.json({ success: false, error: 'Missing approval_id' }, { status: 400 });
    }
    const resolved = toolApprovalService.resolve(approval_id, true);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Approval not found or already resolved' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { status: 'approved', approval_id } });
  }

  if (action === 'reject_tool') {
    const { approval_id, rejection_reason } = body;
    if (!approval_id) {
      return NextResponse.json({ success: false, error: 'Missing approval_id' }, { status: 400 });
    }
    const resolved = toolApprovalService.resolve(approval_id, false, rejection_reason);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Approval not found or already resolved' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { status: 'rejected', approval_id } });
  }

  if (action === 'approve_upgrade') {
    const { upgrade_id } = body;
    if (!upgrade_id) {
      return NextResponse.json({ success: false, error: 'Missing upgrade_id' }, { status: 400 });
    }
    const resolved = compactionUpgradeService.resolve(upgrade_id, true);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Upgrade not found or already resolved' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { status: 'approved', upgrade_id } });
  }

  if (action === 'reject_upgrade') {
    const { upgrade_id } = body;
    if (!upgrade_id) {
      return NextResponse.json({ success: false, error: 'Missing upgrade_id' }, { status: 400 });
    }
    const resolved = compactionUpgradeService.resolve(upgrade_id, false);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Upgrade not found or already resolved' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { status: 'rejected', upgrade_id } });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}
