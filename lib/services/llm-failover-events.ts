import { supabase, supabaseConfigured } from '@/lib/db/client';

export interface RecordLlmFailoverEventParams {
  projectId?: string | null;
  agentName?: string | null;
  model?: string | null;
  eventType: 'switch' | 'exhausted';
  fromAccountId?: string | null;
  fromAccountName?: string | null;
  toAccountId?: string | null;
  toAccountName?: string | null;
  reason?: string | null;
  errorStatus?: number | null;
  errorCode?: string | null;
}

export async function recordLlmFailoverEvent(
  params: RecordLlmFailoverEventParams
): Promise<void> {
  const { error } = await supabase.from('llm_failover_events').insert({
    project_id: params.projectId ?? null,
    agent_name: params.agentName ?? null,
    model: params.model ?? null,
    event_type: params.eventType,
    from_account_id: params.fromAccountId ?? null,
    from_account_name: params.fromAccountName ?? null,
    to_account_id: params.toAccountId ?? null,
    to_account_name: params.toAccountName ?? null,
    reason: params.reason ?? null,
    error_status: params.errorStatus ?? null,
    error_code: params.errorCode ?? null,
  });

  if (error) {
    console.error('[llm-failover-events] Failed to record event:', error.message);
  }
}

export interface LlmFailoverEvent {
  id: string;
  eventType: 'switch' | 'exhausted';
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  reason: string | null;
  errorStatus: number | null;
  errorCode: string | null;
  createdAt: string;
}

export async function listRecentLlmFailoverEvents(limit = 20): Promise<LlmFailoverEvent[]> {
  if (!supabaseConfigured) return [];

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
  const { data, error } = await supabase
    .from('llm_failover_events')
    .select(
      'id,event_type,from_account_id,from_account_name,to_account_id,to_account_name,reason,error_status,error_code,created_at'
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('[llm-failover-events] Failed to list recent events:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    eventType: row.event_type,
    fromAccountId: row.from_account_id,
    fromAccountName: row.from_account_name,
    toAccountId: row.to_account_id,
    toAccountName: row.to_account_name,
    reason: row.reason,
    errorStatus: row.error_status,
    errorCode: row.error_code,
    createdAt: row.created_at,
  }));
}
