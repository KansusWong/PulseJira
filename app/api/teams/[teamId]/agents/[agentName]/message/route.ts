import { NextResponse } from 'next/server';
import { mateMessageQueue } from '@/lib/services/mate-message-queue';

/**
 * POST /api/teams/:teamId/agents/:agentName/message
 * Enqueue a user message for a specific mate agent.
 * The agent picks it up on its next ReAct step.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string; agentName: string }> },
) {
  const { teamId, agentName } = await params;

  const body = await req.json().catch(() => null);
  const message = body?.message;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  mateMessageQueue.enqueue(teamId, agentName, message.trim());

  return NextResponse.json({ success: true });
}
