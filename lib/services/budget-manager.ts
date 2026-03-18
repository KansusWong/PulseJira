/**
 * BudgetManager — token budget pre-allocation, tracking, and overage warning.
 *
 * Each Mission gets a total token budget (configurable, default 200k).
 * The BudgetManager:
 *   1. Pre-allocates a slice to each mate based on task count
 *   2. Tracks consumption in real-time via recordUsage callbacks
 *   3. Fires warnings at 70% and 90% thresholds
 *   4. Hard-caps individual mates at their allocation * 1.5 (soft overflow)
 *
 * All budgets are in-memory per-mission. No DB persistence needed —
 * the final totals are written to missions.tokens_used during archival.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetAllocation {
  mateName: string;
  allocated: number;
  used: number;
}

export interface BudgetWarning {
  mateName: string;
  level: 'approaching' | 'critical' | 'exceeded';
  usedPct: number;
  message: string;
}

export type BudgetWarningCallback = (warning: BudgetWarning) => void;

export interface BudgetManagerOptions {
  /** Total mission budget in tokens. */
  totalBudget: number;
  /** Callback when a mate approaches/exceeds budget. */
  onWarning?: BudgetWarningCallback;
  /** Soft overflow multiplier (default 1.5 — mate can use up to 150% of allocation). */
  overflowMultiplier?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MISSION_BUDGET = 200_000;
const WARN_THRESHOLD = 0.70;
const CRITICAL_THRESHOLD = 0.90;
const DEFAULT_OVERFLOW_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// BudgetManager
// ---------------------------------------------------------------------------

export class BudgetManager {
  private totalBudget: number;
  private allocations = new Map<string, BudgetAllocation>();
  private onWarning: BudgetWarningCallback | undefined;
  private overflowMultiplier: number;
  /** Unallocated reserve for late-joining mates or rebalancing. */
  private reserve: number;

  constructor(options?: Partial<BudgetManagerOptions>) {
    this.totalBudget = options?.totalBudget ?? DEFAULT_MISSION_BUDGET;
    this.onWarning = options?.onWarning;
    this.overflowMultiplier = options?.overflowMultiplier ?? DEFAULT_OVERFLOW_MULTIPLIER;
    this.reserve = this.totalBudget;
  }

  // -------------------------------------------------------------------------
  // Allocation
  // -------------------------------------------------------------------------

  /**
   * Pre-allocate budget equally among a list of mates.
   * Keeps 10% in reserve for rebalancing.
   */
  allocateEqual(mateNames: string[]): void {
    if (mateNames.length === 0) return;
    const reservePct = 0.10;
    const distributable = Math.floor(this.totalBudget * (1 - reservePct));
    const perMate = Math.floor(distributable / mateNames.length);
    this.reserve = this.totalBudget - perMate * mateNames.length;

    for (const name of mateNames) {
      this.allocations.set(name, { mateName: name, allocated: perMate, used: 0 });
    }
  }

  /**
   * Allocate budget by weight map. Weights are relative (e.g., { dev: 3, qa: 1 }).
   */
  allocateWeighted(weights: Record<string, number>): void {
    const entries = Object.entries(weights);
    if (entries.length === 0) return;
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    const reservePct = 0.10;
    const distributable = Math.floor(this.totalBudget * (1 - reservePct));

    let allocated = 0;
    for (const [name, weight] of entries) {
      const perMate = Math.floor(distributable * (weight / totalWeight));
      this.allocations.set(name, { mateName: name, allocated: perMate, used: 0 });
      allocated += perMate;
    }
    this.reserve = this.totalBudget - allocated;
  }

  // -------------------------------------------------------------------------
  // Tracking
  // -------------------------------------------------------------------------

  /**
   * Record token usage for a mate. Returns true if within budget, false if exceeded hard cap.
   */
  record(mateName: string, tokens: number): boolean {
    let alloc = this.allocations.get(mateName);
    if (!alloc) {
      // Late-joining mate — allocate from reserve
      const slice = Math.min(this.reserve, Math.floor(this.totalBudget * 0.15));
      alloc = { mateName, allocated: slice, used: 0 };
      this.allocations.set(mateName, alloc);
      this.reserve -= slice;
    }

    alloc.used += tokens;
    const usedPct = alloc.used / alloc.allocated;
    const hardCap = alloc.allocated * this.overflowMultiplier;

    // Fire warnings at thresholds
    if (usedPct >= CRITICAL_THRESHOLD && usedPct - (tokens / alloc.allocated) < CRITICAL_THRESHOLD) {
      this.onWarning?.({
        mateName,
        level: 'critical',
        usedPct,
        message: `${mateName} 已使用 ${Math.round(usedPct * 100)}% 预算 (${alloc.used}/${alloc.allocated} tokens)`,
      });
    } else if (usedPct >= WARN_THRESHOLD && usedPct - (tokens / alloc.allocated) < WARN_THRESHOLD) {
      this.onWarning?.({
        mateName,
        level: 'approaching',
        usedPct,
        message: `${mateName} 已使用 ${Math.round(usedPct * 100)}% 预算`,
      });
    }

    if (alloc.used > hardCap) {
      this.onWarning?.({
        mateName,
        level: 'exceeded',
        usedPct,
        message: `${mateName} 已超出预算上限 (${alloc.used}/${hardCap} tokens)`,
      });
      return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Get allocation for a specific mate. */
  getAllocation(mateName: string): BudgetAllocation | undefined {
    return this.allocations.get(mateName);
  }

  /** Get all allocations. */
  getAllAllocations(): BudgetAllocation[] {
    return [...this.allocations.values()];
  }

  /** Total tokens used across all mates. */
  getTotalUsed(): number {
    let total = 0;
    for (const alloc of this.allocations.values()) {
      total += alloc.used;
    }
    return total;
  }

  /** Remaining budget (total - used across all mates). */
  getRemaining(): number {
    return this.totalBudget - this.getTotalUsed();
  }

  /** Summary snapshot for SSE / UI display. */
  getSummary(): {
    total: number;
    used: number;
    remaining: number;
    reserve: number;
    mates: BudgetAllocation[];
  } {
    return {
      total: this.totalBudget,
      used: this.getTotalUsed(),
      remaining: this.getRemaining(),
      reserve: this.reserve,
      mates: this.getAllAllocations(),
    };
  }

  // -------------------------------------------------------------------------
  // Rebalance
  // -------------------------------------------------------------------------

  /**
   * Reclaim unused budget from a completed mate and add to reserve.
   */
  reclaim(mateName: string): void {
    const alloc = this.allocations.get(mateName);
    if (!alloc) return;
    const unused = Math.max(0, alloc.allocated - alloc.used);
    this.reserve += unused;
    alloc.allocated = alloc.used; // shrink to actual usage
  }

  /**
   * Grant additional budget from reserve to a specific mate.
   */
  grant(mateName: string, extraTokens: number): void {
    const alloc = this.allocations.get(mateName);
    if (!alloc) return;
    const grant = Math.min(extraTokens, this.reserve);
    alloc.allocated += grant;
    this.reserve -= grant;
  }
}
