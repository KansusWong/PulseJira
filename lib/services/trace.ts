/**
 * Execution trace service — persists SSE events for post-hoc analysis.
 * Fire-and-forget: errors are logged, never thrown.
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';

// ---------- internal state ----------

interface BufferedEvent {
  trace_id: string;
  seq: number;
  event_type: string;
  agent_name: string | null;
  payload: any;
}

const buffers = new Map<string, BufferedEvent[]>();
const seqCounters = new Map<string, number>();

const FLUSH_SIZE = 20;
const FLUSH_INTERVAL_MS = 500;
const MAX_PAYLOAD_BYTES = 10_000;

let flushTimer: ReturnType<typeof setInterval> | null = null;

// ---------- helpers ----------

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    for (const traceId of buffers.keys()) {
      flushBuffer(traceId);
    }
    if (buffers.size === 0 && flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }, FLUSH_INTERVAL_MS);
}

function truncatePayload(payload: any, eventType: string): any {
  if (payload == null) return payload;
  const raw = JSON.stringify(payload);
  if (raw.length <= MAX_PAYLOAD_BYTES) return payload;
  return { _truncated: true, event_type: eventType, preview: raw.slice(0, 200) };
}

async function flushBuffer(traceId: string) {
  const batch = buffers.get(traceId);
  if (!batch || batch.length === 0) return;
  buffers.set(traceId, []);

  try {
    const { error } = await supabase.from('execution_events').insert(batch);
    if (error) console.error('[trace] flush error:', error.message);
  } catch (e: any) {
    console.error('[trace] flush exception:', e.message);
  }
}

// ---------- public API ----------

export function startTrace(
  traceId: string,
  projectId: string,
  stage: string
): void {
  if (!supabaseConfigured) return;
  seqCounters.set(traceId, 0);
  buffers.set(traceId, []);

  supabase
    .from('execution_traces')
    .insert({ trace_id: traceId, project_id: projectId, stage, status: 'running' })
    .then(({ error }) => {
      if (error) console.error('[trace] startTrace error:', error.message);
    });
}

export function recordEvent(
  traceId: string,
  eventType: string,
  agentName: string | null | undefined,
  payload: any
): void {
  if (!supabaseConfigured) return;

  const seq = (seqCounters.get(traceId) ?? 0) + 1;
  seqCounters.set(traceId, seq);

  const buffer = buffers.get(traceId);
  if (!buffer) return; // trace not started

  buffer.push({
    trace_id: traceId,
    seq,
    event_type: eventType,
    agent_name: agentName ?? null,
    payload: truncatePayload(payload, eventType),
  });

  if (buffer.length >= FLUSH_SIZE) {
    flushBuffer(traceId);
  }

  ensureFlushTimer();
}

export async function completeTrace(
  traceId: string,
  status: 'completed' | 'failed',
  summary?: Record<string, any>
): Promise<void> {
  if (!supabaseConfigured) return;

  // Flush remaining events
  await flushBuffer(traceId);

  const finalSummary = summary ?? { total_events: seqCounters.get(traceId) ?? 0 };

  try {
    const { error } = await supabase
      .from('execution_traces')
      .update({
        status,
        completed_at: new Date().toISOString(),
        summary: finalSummary,
      })
      .eq('trace_id', traceId);
    if (error) console.error('[trace] completeTrace error:', error.message);
  } catch (e: any) {
    console.error('[trace] completeTrace exception:', e.message);
  }

  // Cleanup
  buffers.delete(traceId);
  seqCounters.delete(traceId);
}
