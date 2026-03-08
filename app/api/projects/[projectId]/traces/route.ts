import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/projects/[projectId]/traces?stage=implement&status=completed&limit=50
 * → { success: true, data: ExecutionTrace[] }
 */
export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    assertSupabase();

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const status = searchParams.get('status');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    let query = supabase
      .from('execution_traces')
      .select('*')
      .eq('project_id', params.projectId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (stage) query = query.eq('stage', stage);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return errorResponse(error.message);

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error(`[API] GET traces:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
