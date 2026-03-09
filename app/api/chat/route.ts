/**
 * POST /api/chat
 *
 * Main chat endpoint. Accepts a message and optional conversation_id.
 * Returns an SSE stream of ChatEvents.
 */

import { chatEngine } from '@/lib/services/chat-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const { conversation_id, message } = body;

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of chatEngine.handleMessage(conversation_id, message)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (error: any) {
        const errorEvent = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
