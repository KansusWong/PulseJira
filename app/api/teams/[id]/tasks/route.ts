/**
 * GET   /api/teams/[id]/tasks — list team tasks
 * POST  /api/teams/[id]/tasks — create a team task
 * PATCH /api/teams/[id]/tasks — update task status (with dependency enforcement)
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
    .from('team_tasks')
    .select('*')
    .eq('team_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { subject, description, owner } = body;

  if (!subject) {
    return NextResponse.json({ success: false, error: 'subject is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('team_tasks')
    .insert({
      team_id: params.id,
      subject,
      description: description || null,
      owner: owner || null,
      status: 'pending',
    })
    .select()
    .single();

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
    const { taskId, status, result } = body;

    if (!taskId || !status) {
      return NextResponse.json({ success: false, error: 'taskId and status are required' }, { status: 400 });
    }

    const task = await teamCoordinator.updateTaskStatus(params.id, taskId, status, result);
    return NextResponse.json({ success: true, data: task });
  } catch (error: any) {
    const statusCode = error.message?.includes('blocked by') ? 409 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
  }
}
