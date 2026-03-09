/**
 * GET /api/signals/stream — SSE endpoint for real-time signal push.
 *
 * Polls DB every N seconds for new signals and pushes them to the client.
 * The client keeps an EventSource connection open.
 *
 * Query params:
 *   ?since=ISO8601   — only signals after this timestamp (default: 1 hour ago)
 *   ?interval=10000  — poll interval in ms (default: 10000)
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!supabaseConfigured) {
    const enc = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', error: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' })}\n\n`));
        controller.close();
      },
    });
    return new NextResponse(errorStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get('since') || new Date(Date.now() - 3600_000).toISOString();
  const interval = Math.max(5000, Number(url.searchParams.get('interval') || '10000'));

  const encoder = new TextEncoder();
  let lastTimestamp = since;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const poll = async () => {
        if (closed) return;

        try {
          const { data: signals, error } = await supabase
            .from('signals')
            .select('id, content, source_url, status, platform, metadata, received_at')
            .gt('received_at', lastTimestamp)
            .order('received_at', { ascending: true })
            .limit(20);

          if (!error && signals && signals.length > 0) {
            for (const signal of signals) {
              const event = `data: ${JSON.stringify(signal)}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
            lastTimestamp = signals[signals.length - 1].received_at;
          }
        } catch (e) {
          console.error('[signals/stream] Poll error:', e);
        }

        if (!closed) {
          // Keepalive
          controller.enqueue(encoder.encode(`: ping\n\n`));
          setTimeout(poll, interval);
        }
      };

      // Start polling
      setTimeout(poll, 1000);

      // Clean up when client disconnects
      req.signal?.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
