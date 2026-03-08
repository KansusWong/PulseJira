import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/projects/[projectId]/traces/[traceId]
 * → { success: true, data: { trace: ExecutionTrace, events: ExecutionEvent[] } }
 */
export async function GET(
  _req: Request,
  { params }: { params: { projectId: string; traceId: string } }
) {
  try {
    assertSupabase();

    const { data: trace, error: traceErr } = await supabase
      .from('execution_traces')
      .select('*')
      .eq('trace_id', params.traceId)
      .eq('project_id', params.projectId)
      .single();

    if (traceErr || !trace) {
      return errorResponse('Trace not found', 404);
    }

    const { data: events, error: eventsErr } = await supabase
      .from('execution_events')
      .select('*')
      .eq('trace_id', params.traceId)
      .order('seq', { ascending: true });

    if (eventsErr) {
      return errorResponse(eventsErr.message);
    }

    return NextResponse.json({ success: true, data: { trace, events } });
  } catch (e: any) {
    console.error(`[API] GET trace detail:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
