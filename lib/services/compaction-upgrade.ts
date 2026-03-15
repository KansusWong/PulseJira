/**
 * CompactionUpgradeService — in-memory approval gate for compaction → Team upgrade.
 *
 * When the agent's context window hits ≥75% usage, the compressContext() callback
 * creates a pending entry here. The agent thread blocks on the returned promise
 * until the user approves/rejects via the API, or the 30-second timeout expires
 * (auto-reject).
 */

export interface PendingUpgrade {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  conversationId: string;
}

/** Default timeout: 30 seconds (auto-reject). */
const UPGRADE_TIMEOUT_MS = 30 * 1000;

class CompactionUpgradeService {
  private pending = new Map<string, PendingUpgrade>();

  /**
   * Register a new upgrade request. Returns a promise that blocks until
   * the request is resolved (approve/reject) or times out.
   */
  requestUpgrade(params: {
    upgradeId: string;
    conversationId: string;
  }): { upgradeId: string; promise: Promise<boolean> } {
    const { upgradeId, conversationId } = params;

    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Auto-reject on timeout
        this.pending.delete(upgradeId);
        console.log(`[CompactionUpgrade] Upgrade ${upgradeId} timed out (30s), auto-rejecting`);
        resolve(false);
      }, UPGRADE_TIMEOUT_MS);

      this.pending.set(upgradeId, { resolve, timer, conversationId });
    });

    return { upgradeId, promise };
  }

  /**
   * Resolve a pending upgrade (approve or reject).
   * Returns true if the upgrade existed and was resolved, false if not found.
   */
  resolve(upgradeId: string, approved: boolean): boolean {
    const entry = this.pending.get(upgradeId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(upgradeId);

    console.log(
      `[CompactionUpgrade] Upgrade ${upgradeId} ${approved ? 'approved' : 'rejected'} by user`,
    );

    entry.resolve(approved);
    return true;
  }

  /** Check if an upgrade is pending. */
  hasPending(upgradeId: string): boolean {
    return this.pending.has(upgradeId);
  }

  /** Get the number of pending upgrades (for diagnostics). */
  get pendingCount(): number {
    return this.pending.size;
  }
}

/** Singleton instance. */
export const compactionUpgradeService = new CompactionUpgradeService();
