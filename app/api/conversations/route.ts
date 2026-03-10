/**
 * GET  /api/conversations — list all conversations
 * POST /api/conversations — create a new conversation
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { createConversationSchema } from '@/lib/validations/api-schemas';

export const GET = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit: 50, offset: 0 } });
  }

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data, pagination: { total: count ?? 0, limit, offset } });
});

export const POST = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return NextResponse.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        title: null,
        status: 'active',
        created_at: new Date().toISOString(),
      },
    });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  const parsed = createConversationSchema.parse(body);

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      title: parsed.title || null,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data });
});
