/**
 * GET  /api/conversations/[id]/plan — get plan/assessment data
 * POST /api/conversations/[id]/plan — approve or reject plan
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { chatEngine } from '@/lib/services/chat-engine';
import { toolApprovalService } from '@/lib/services/tool-approval';

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
    // Execute the approved plan via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const conversation = await chatEngine.getOrCreateConversation(params.id);
          const mode = conversation.execution_mode || 'single_agent';
          for await (const event of chatEngine.executePlan(params.id, mode)) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        } catch (error: any) {
          const errorEvent = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  if (action === 'confirm_requirements') {
    const { requirements } = body;
    if (!requirements) {
      return NextResponse.json({ success: false, error: 'Missing requirements' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of chatEngine.confirmAndExecute(params.id, requirements)) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        } catch (error: any) {
          const errorEvent = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
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
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of chatEngine.executeDmApproval(params.id)) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        } catch (error: any) {
          const errorEvent = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
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
    const { approval_id } = body;
    if (!approval_id) {
      return NextResponse.json({ success: false, error: 'Missing approval_id' }, { status: 400 });
    }
    const resolved = toolApprovalService.resolve(approval_id, false);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Approval not found or already resolved' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { status: 'rejected', approval_id } });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}
