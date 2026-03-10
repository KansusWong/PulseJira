/**
 * GET    /api/teams/[id]/mailbox — list team communication records
 * PATCH  /api/teams/[id]/mailbox — mark messages as read for an agent
 * DELETE /api/teams/[id]/mailbox — cleanup old mailbox messages
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { teamCoordinator } from '@/lib/services/team-coordinator';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { markReadSchema } from '@/lib/validations/api-schemas';

export const GET = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit: 50, offset: 0 } });
  }

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('agent_mailbox')
    .select('*', { count: 'exact' })
    .eq('team_id', params.id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data, pagination: { total: count ?? 0, limit, offset } });
});

export const PATCH = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  const body = await req.json();
  const parsed = markReadSchema.parse(body);

  const count = await teamCoordinator.markAsRead(params.id, parsed.toAgent);
  return NextResponse.json({ success: true, data: { marked: count } });
});

export const DELETE = withErrorHandler(async (
  _req: Request,
  { params }: { params: { id: string } },
) => {
  const count = await teamCoordinator.cleanupMailbox(params.id);
  return NextResponse.json({ success: true, data: { deleted: count } });
});
