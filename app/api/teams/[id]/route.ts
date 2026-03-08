/**
 * GET    /api/teams/[id] — get team details
 * DELETE /api/teams/[id] — disband team
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { teamCoordinator } from '@/lib/services/team-coordinator';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('agent_teams')
    .select('*, team_tasks(*)')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await teamCoordinator.disbandTeam(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
