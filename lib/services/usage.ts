/**
 * LLM token usage recording service.
 * Inserts usage rows into llm_usage for aggregation in Settings usage snapshot.
 * Includes cost calculation (#23) and trace correlation (#22).
 */

import { supabase } from '@/lib/db/client';
import { calculateCostUsd } from '@/lib/config/model-pricing';

export interface RecordLlmUsageParams {
  projectId?: string | null;
  agentName: string;
  model?: string | null;
  promptTokens: number;
  completionTokens: number;
  durationMs?: number;
  accountId?: string;
  accountName?: string;
  signalId?: string | null;
  traceId?: string | null;
}

export async function recordLlmUsage(params: RecordLlmUsageParams): Promise<void> {
  const {
    projectId,
    agentName,
    model,
    promptTokens,
    completionTokens,
    durationMs,
    accountId,
    accountName,
    signalId,
    traceId,
  } = params;
  const totalTokens = promptTokens + completionTokens;
  const costUsd = calculateCostUsd(model, promptTokens, completionTokens);

  const { error } = await supabase.from('llm_usage').insert({
    project_id: projectId ?? null,
    agent_name: agentName,
    model: model ?? null,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    account_id: accountId ?? null,
    account_name: accountName ?? null,
    duration_ms: typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? Math.max(0, Math.floor(durationMs))
      : null,
    signal_id: signalId ?? null,
    trace_id: traceId ?? null,
    cost_usd: costUsd,
  });

  if (error) {
    console.error('[usage] Failed to record LLM usage:', error.message);
  }
}
