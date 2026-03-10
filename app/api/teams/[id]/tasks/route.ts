/**
 * GET   /api/teams/[id]/tasks — list team tasks
 * POST  /api/teams/[id]/tasks — create a team task
 * PATCH /api/teams/[id]/tasks — update task status (with dependency enforcement)
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { teamCoordinator } from '@/lib/services/team-coordinator';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { createTeamTaskSchema, updateTeamTaskSchema } from '@/lib/validations/api-schemas';

export const GET = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit: 50, offset: 0 } });
  }

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('team_tasks')
    .select('*', { count: 'exact' })
    .eq('team_id', params.id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data, pagination: { total: count ?? 0, limit, offset } });
});

export const POST = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const body = await req.json();
  const parsed = createTeamTaskSchema.parse(body);

  const { data, error } = await supabase
    .from('team_tasks')
    .insert({
      team_id: params.id,
      subject: parsed.subject,
      description: parsed.description || null,
      owner: parsed.owner || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data });
});

export const PATCH = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  const body = await req.json();
  const parsed = updateTeamTaskSchema.parse(body);

  const task = await teamCoordinator.updateTaskStatus(params.id, parsed.taskId, parsed.status, parsed.result as Record<string, any> | undefined);
  return NextResponse.json({ success: true, data: task });
});
