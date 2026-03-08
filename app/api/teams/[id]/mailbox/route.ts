/**
 * GET    /api/teams/[id]/mailbox — list team communication records
 * PATCH  /api/teams/[id]/mailbox — mark messages as read for an agent
 * DELETE /api/teams/[id]/mailbox — cleanup old mailbox messages
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { teamCoordinator } from '@/lib/services/team-coordinator';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data, error } = await supabase
    .from('agent_mailbox')
    .select('*')
    .eq('team_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { toAgent } = body;

    if (!toAgent) {
      return NextResponse.json({ success: false, error: 'toAgent is required' }, { status: 400 });
    }

    const count = await teamCoordinator.markAsRead(params.id, toAgent);
    return NextResponse.json({ success: true, data: { marked: count } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const count = await teamCoordinator.cleanupMailbox(params.id);
    return NextResponse.json({ success: true, data: { deleted: count } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
