import { NextResponse } from 'next/server';
import { mateMessageQueue } from '@/lib/services/mate-message-queue';
import { supabase, supabaseConfigured } from '@/lib/db/client';

/**
 * POST /api/teams/:teamId/intervene
 * Send an instruction to one or all agents in a team.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { type, instruction, target } = body;

  if (type !== 'send_instruction' || !instruction || typeof instruction !== 'string') {
    return NextResponse.json({ error: 'type must be "send_instruction" and instruction is required' }, { status: 400 });
  }

  if (target && typeof target === 'string') {
    // Send to a specific agent
    mateMessageQueue.enqueue(teamId, target, instruction.trim());
  } else {
    // Broadcast to all agents in the team — look up roster from DB or fallback
    let agentNames: string[] = [];
    if (supabaseConfigured) {
      const { data } = await supabase
        .from('agent_teams')
        .select('config')
        .eq('id', teamId)
        .single();
      if (data?.config?.teammates) {
        agentNames = (data.config.teammates as Array<{ name: string }>).map((t) => t.name);
      }
    }

    for (const name of agentNames) {
      mateMessageQueue.enqueue(teamId, name, instruction.trim());
    }
  }

  return NextResponse.json({ success: true });
}
