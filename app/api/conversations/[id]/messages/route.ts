/**
 * GET /api/conversations/[id]/messages — list messages for a conversation
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
