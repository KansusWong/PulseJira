/**
 * POST /api/chat
 *
 * Main chat endpoint. Accepts a message and optional conversation_id.
 * Returns an SSE stream of ChatEvents.
 */

import { chatEngine } from '@/lib/services/chat-engine';
import { webhookService } from '@/lib/services/webhook';
import { makeSSEResponseFromGenerator } from '@/lib/utils/api-error';
import { getAuthContext } from '@/lib/auth';

// Lazy-init webhook listener (idempotent, safe to call on every cold start)
webhookService.init();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const { conversation_id, message, attachments, thinking, model, project_id } = body;
  const auth = getAuthContext();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return makeSSEResponseFromGenerator(
    chatEngine.handleMessage(conversation_id, message, attachments, {
      thinking: !!thinking,
      model: model || undefined,
      orgId: auth.orgId || undefined,
      userId: auth.userId || undefined,
      projectId: project_id || undefined,
    }),
    { signal: req.signal },
  );
}
