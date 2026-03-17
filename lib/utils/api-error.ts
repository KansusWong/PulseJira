import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth';

/** Unified JSON error response */
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Wrap a non-streaming route handler with automatic catch for unhandled exceptions */
export function withErrorHandler(
  handler: (req: Request, ctx: any) => Promise<NextResponse>
) {
  return async (req: Request, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (e: unknown) {
      if (e instanceof ZodError) {
        return errorResponse(e.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; '), 400);
      }
      if (e instanceof AuthError) {
        return errorResponse(e.message, e.status);
      }
      const message = e instanceof Error ? e.message : 'Internal Server Error';
      console.error(`[API Error] ${req.method} ${new URL(req.url).pathname}:`, e);
      return errorResponse(message, 500);
    }
  };
}

/** SSE defensive writer — silently absorbs writes after the stream is closed */
export function createSafeWriter(writer: WritableStreamDefaultWriter<any>) {
  const encoder = new TextEncoder();
  let closed = false;

  return {
    get closed() { return closed; },

    async write(data: Record<string, unknown>) {
      if (closed) return;
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        closed = true;
      }
    },

    async log(message: string) {
      await this.write({ type: 'log', message });
    },

    async close() {
      if (closed) return;
      try {
        await writer.close();
      } catch {
        // already closed
      } finally {
        closed = true;
      }
    },
  };
}

/** Heartbeat interval for long-running SSE streams (ms). */
const SSE_HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/** Default pipeline timeout for SSE streams. */
const SSE_PIPELINE_TIMEOUT_MS = 600_000; // 10 minutes

export interface SSEOptions {
  /** Pipeline hard timeout (ms). Defaults to 280s. */
  timeoutMs?: number;
  /** Request AbortSignal — detects client disconnect to stop writing. */
  signal?: AbortSignal;
}

/**
 * SSE streaming response from an async generator.
 * Adds heartbeat keep-alive, pipeline timeout, and client disconnect detection.
 * Replaces raw ReadableStream boilerplate in route handlers.
 */
export function makeSSEResponseFromGenerator(
  generator: AsyncGenerator<any>,
  options?: SSEOptions,
) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const safe = createSafeWriter(writer);
  const timeoutMs = options?.timeoutMs ?? SSE_PIPELINE_TIMEOUT_MS;

  (async () => {
    // Heartbeat to keep connection alive through proxies / load balancers
    const heartbeat = setInterval(() => {
      if (safe.closed) {
        clearInterval(heartbeat);
        return;
      }
      safe.write({ type: 'heartbeat', ts: Date.now() }).catch(() => {
        clearInterval(heartbeat);
      });
    }, SSE_HEARTBEAT_INTERVAL_MS);

    // Pipeline timeout — graceful shutdown before Vercel hard-kills the function
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; }, timeoutMs);

    // Client disconnect detection
    let clientDisconnected = false;
    const onAbort = () => { clientDisconnected = true; };
    options?.signal?.addEventListener('abort', onAbort);

    try {
      for await (const event of generator) {
        if (timedOut || clientDisconnected || safe.closed) break;
        await safe.write(event);
      }
      if (!clientDisconnected && !timedOut) {
        // Generator completed normally — no extra action needed
      } else if (timedOut && !clientDisconnected) {
        await safe.write({
          type: 'error',
          data: { message: `Pipeline timeout: exceeded ${Math.round(timeoutMs / 1000)}s limit` },
        });
      }
    } catch (e: unknown) {
      console.error('[SSE Generator Error]', e);
      if (!clientDisconnected) {
        const message = e instanceof Error ? e.message : 'Internal Server Error';
        await safe.write({ type: 'error', data: { message } });
      }
    } finally {
      clearTimeout(timeoutId);
      clearInterval(heartbeat);
      options?.signal?.removeEventListener('abort', onAbort);
      await safe.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/** SSE streaming response factory — replaces per-route makeStreamResponse helpers */
export function makeSSEResponse(
  processor: (safe: ReturnType<typeof createSafeWriter>) => Promise<any>,
  options?: SSEOptions,
) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const safe = createSafeWriter(writer);
  const timeoutMs = options?.timeoutMs ?? SSE_PIPELINE_TIMEOUT_MS;

  (async () => {
    // Start heartbeat to keep connection alive through proxies / load balancers
    const heartbeat = setInterval(() => {
      if (safe.closed) {
        clearInterval(heartbeat);
        return;
      }
      safe.write({ type: 'heartbeat', ts: Date.now() }).catch(() => {
        clearInterval(heartbeat);
      });
    }, SSE_HEARTBEAT_INTERVAL_MS);

    // Pipeline timeout (#13) — graceful shutdown before Vercel hard-kills the function
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Pipeline timeout: exceeded ${Math.round(timeoutMs / 1000)}s limit`)),
        timeoutMs,
      );
    });

    // Client disconnect detection (#13)
    let clientDisconnected = false;
    const onAbort = () => { clientDisconnected = true; };
    options?.signal?.addEventListener('abort', onAbort);

    try {
      const data = await Promise.race([processor(safe), timeoutPromise]);
      if (!clientDisconnected) {
        await safe.write({ type: 'result', data });
      }
    } catch (e: unknown) {
      console.error('[SSE Error]', e);
      if (!clientDisconnected) {
        const message = e instanceof Error ? e.message : 'Internal Server Error';
        await safe.write({ type: 'error', error: message });
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(heartbeat);
      options?.signal?.removeEventListener('abort', onAbort);
      await safe.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
