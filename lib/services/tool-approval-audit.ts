import { supabase, supabaseConfigured } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordToolApprovalEventParams {
  approvalId: string;
  conversationId?: string | null;
  agentName: string;
  toolName: string;
  toolArgs?: Record<string, any> | null;
  status: 'requested' | 'approved' | 'rejected' | 'timed_out';
  decidedBy?: string | null;       // 'user' | 'timeout'
  rejectionReason?: string | null;
}

export interface ToolApprovalAudit {
  id: string;
  approvalId: string;
  conversationId: string | null;
  agentName: string;
  toolName: string;
  toolArgs: Record<string, any> | null;
  status: 'requested' | 'approved' | 'rejected' | 'timed_out';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Record (fire-and-forget)
// ---------------------------------------------------------------------------

export async function recordToolApprovalEvent(
  params: RecordToolApprovalEventParams,
): Promise<void> {
  if (!supabaseConfigured) return;

  if (params.status === 'requested') {
    // Insert a new row
    const { error } = await supabase.from('tool_approval_audits').insert({
      approval_id: params.approvalId,
      conversation_id: params.conversationId ?? null,
      agent_name: params.agentName,
      tool_name: params.toolName,
      tool_args: params.toolArgs ?? null,
      status: 'requested',
    });

    if (error) {
      console.error('[tool-approval-audit] Failed to insert event:', error.message);
    }
  } else {
    // Update existing row (approved / rejected / timed_out)
    const { error } = await supabase
      .from('tool_approval_audits')
      .update({
        status: params.status,
        decided_at: new Date().toISOString(),
        decided_by: params.decidedBy ?? null,
        rejection_reason: params.rejectionReason ?? null,
      })
      .eq('approval_id', params.approvalId);

    if (error) {
      console.error('[tool-approval-audit] Failed to update event:', error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listToolApprovalAudits(
  conversationId: string,
  limit = 50,
): Promise<ToolApprovalAudit[]> {
  if (!supabaseConfigured) return [];

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

  const { data, error } = await supabase
    .from('tool_approval_audits')
    .select(
      'id,approval_id,conversation_id,agent_name,tool_name,tool_args,status,requested_at,decided_at,decided_by,rejection_reason,created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('[tool-approval-audit] Failed to list audits:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    approvalId: row.approval_id,
    conversationId: row.conversation_id,
    agentName: row.agent_name,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  }));
}
