/**
 * GET    /api/conversations/[id] — get conversation details
 * PATCH  /api/conversations/[id] — update conversation
 * DELETE /api/conversations/[id] — delete conversation
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { data, error } = await supabase
    .from('conversations')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
