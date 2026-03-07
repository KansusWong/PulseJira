/**
 * ToolApprovalService — in-memory approval gate for dangerous tool executions.
 *
 * When a sub-agent attempts to call a tool with `requiresApproval = true`,
 * the approval callback creates a pending entry here. The agent thread
 * blocks on the returned promise until the user approves/rejects via the API,
 * or the 10-minute timeout expires (auto-reject).
 */

export interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  toolName: string;
  agentName: string;
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
  }): { approvalId: string; promise: Promise<boolean> } {
    const { approvalId, toolName, agentName } = params;

    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Auto-reject on timeout
        this.pending.delete(approvalId);
        resolve(false);
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(approvalId, { resolve, timer, toolName, agentName });
    });

    return { approvalId, promise };
  }

  /**
   * Resolve a pending approval (approve or reject).
   * Returns true if the approval existed and was resolved, false if not found.
   */
  resolve(approvalId: string, approved: boolean): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(approvalId);
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
