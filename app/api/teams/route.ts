/**
 * POST /api/teams — create a new agent team
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export async function POST(req: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { conversation_id, project_id, team_name, lead_agent, config } = body;

  if (!team_name || !lead_agent) {
    return NextResponse.json({ success: false, error: 'team_name and lead_agent are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('agent_teams')
    .insert({
      conversation_id: conversation_id || null,
      project_id: project_id || null,
      team_name,
      lead_agent,
      status: 'forming',
      config: config || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
