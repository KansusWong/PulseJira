/**
 * ToolApprovalService — in-memory approval gate for dangerous tool executions.
 *
 * When a sub-agent attempts to call a tool with `requiresApproval = true`,
 * the approval callback creates a pending entry here. The agent thread
 * blocks on the returned promise until the user approves/rejects via the API,
 * or the 10-minute timeout expires (auto-reject).
 */

import { recordToolApprovalEvent } from '@/lib/services/tool-approval-audit';

export interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  toolName: string;
  agentName: string;
  conversationId?: string;
}

/** Default timeout: 10 minutes. */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

class ToolApprovalService {
  private pending = new Map<string, PendingApproval>();

  /**
   * Register a new approval request. Returns a promise that blocks until
   * the request is resolved (approve/reject) or times out.
   */
  requestApproval(params: {
    approvalId: string;
    toolName: string;
    agentName: string;
    conversationId?: string;
  }): { approvalId: string; promise: Promise<boolean> } {
    const { approvalId, toolName, agentName, conversationId } = params;

    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Auto-reject on timeout
        this.pending.delete(approvalId);

        // Record timed_out audit event (fire-and-forget)
        recordToolApprovalEvent({
          approvalId,
          conversationId,
          agentName,
          toolName,
          status: 'timed_out',
          decidedBy: 'timeout',
        }).catch(() => {});

        resolve(false);
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(approvalId, { resolve, timer, toolName, agentName, conversationId });
    });

    return { approvalId, promise };
  }

  /**
   * Resolve a pending approval (approve or reject).
   * Returns true if the approval existed and was resolved, false if not found.
   */
  resolve(approvalId: string, approved: boolean, rejectionReason?: string): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(approvalId);

    // Record audit event (fire-and-forget)
    recordToolApprovalEvent({
      approvalId,
      conversationId: entry.conversationId,
      agentName: entry.agentName,
      toolName: entry.toolName,
      status: approved ? 'approved' : 'rejected',
      decidedBy: 'user',
      rejectionReason: approved ? null : (rejectionReason ?? null),
    }).catch(() => {});

    entry.resolve(approved);
    return true;
  }

  /** Check if an approval is pending. */
  hasPending(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  /** Get the number of pending approvals (for diagnostics). */
  get pendingCount(): number {
    return this.pending.size;
  }
}

/** Singleton instance. */
export const toolApprovalService = new ToolApprovalService();
