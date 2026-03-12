/**
 * GET  /api/conversations/[id]/plan — get plan/assessment data
 * POST /api/conversations/[id]/plan — approve or reject plan
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { chatEngine } from '@/lib/services/chat-engine';
import { toolApprovalService } from '@/lib/services/tool-approval';
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
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
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

  if (action === 'approve') {
    const conversation = await chatEngine.getOrCreateConversation(params.id);
    // Use DB execution_mode first, fall back to frontend-provided mode
    // (covers the case where the DB update for assessment failed silently)
    const mode = conversation.execution_mode || body.execution_mode || 'single_agent';
    return makeSSEResponseFromGenerator(
      chatEngine.executePlan(params.id, mode),
      { signal: req.signal },
    );
  }

  if (action === 'confirm_requirements') {
    const { requirements } = body;
    if (!requirements) {
      return NextResponse.json({ success: false, error: 'Missing requirements' }, { status: 400 });
    }

    return makeSSEResponseFromGenerator(
      chatEngine.confirmAndExecute(params.id, requirements),
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

  if (action === 'approve_dm') {
    return makeSSEResponseFromGenerator(
      chatEngine.executeDmApproval(params.id),
      { signal: req.signal },
    );
  }

  if (action === 'start_dm_review') {
    return makeSSEResponseFromGenerator(
      chatEngine.executeDmReview(params.id, body.requirements),
      { signal: req.signal },
    );
  }

  if (action === 'resume_architect') {
    return makeSSEResponseFromGenerator(
      chatEngine.resumeArchitectPhase(params.id),
      { signal: req.signal },
    );
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

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}
