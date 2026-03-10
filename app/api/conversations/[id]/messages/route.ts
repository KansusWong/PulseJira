/**
 * GET /api/conversations/[id]/messages — list messages for a conversation
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';

export const GET = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit: 50, offset: 0 } });
  }

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data, pagination: { total: count ?? 0, limit, offset } });
});
