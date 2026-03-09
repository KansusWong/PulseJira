/**
 * GET  /api/conversations — list all conversations
 * POST /api/conversations — create a new conversation
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export async function GET() {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({}));

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      title: body.title || null,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
