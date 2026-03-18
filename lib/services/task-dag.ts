/**
 * TaskDAG — Directed Acyclic Graph for mission task dependency management.
 *
 * Used by MissionEngine to schedule mate execution:
 * - Tasks with all dependencies completed are "ready" and can be launched
 * - When a task completes, its dependents may become unblocked
 * - Supports topological sort for plan visualization
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed';

export interface TaskNode {
  id: string;
  description: string;
  /** Mate name assigned to this task. */
  assignee: string;
  status: TaskStatus;
  /** Task IDs that this task depends on (must complete before this can start). */
  dependencies: string[];
  /** Task IDs that depend on this task (unblocked when this completes). */
  dependents: string[];
  /** Result/output from the completed task. */
  result?: any;
  /** Artifacts produced by this task. */
  artifacts?: string[];
  /** Metadata: estimated complexity, priority, etc. */
  metadata?: Record<string, any>;
}

export interface DAGStatus {
  total: number;
  pending: number;
  ready: number;
  running: number;
  completed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// TaskDAG
// ---------------------------------------------------------------------------

export class TaskDAG {
  private nodes = new Map<string, TaskNode>();

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /** Add a task to the DAG. */
  addTask(task: {
    id: string;
    description: string;
    assignee: string;
    metadata?: Record<string, any>;
  }): void {
    if (this.nodes.has(task.id)) {
      throw new Error(`Task "${task.id}" already exists in DAG`);
    }
    this.nodes.set(task.id, {
      id: task.id,
      description: task.description,
      assignee: task.assignee,
      status: 'pending',
      dependencies: [],
      dependents: [],
      metadata: task.metadata,
    });
  }

  /**
   * Add a dependency: `taskId` depends on `dependsOnId`.
   * `dependsOnId` must complete before `taskId` can start.
   */
  addDependency(taskId: string, dependsOnId: string): void {
    const task = this.nodes.get(taskId);
    const dep = this.nodes.get(dependsOnId);
    if (!task) throw new Error(`Task "${taskId}" not found in DAG`);
    if (!dep) throw new Error(`Task "${dependsOnId}" not found in DAG`);

    if (!task.dependencies.includes(dependsOnId)) {
      task.dependencies.push(dependsOnId);
    }
    if (!dep.dependents.includes(taskId)) {
      dep.dependents.push(taskId);
    }
  }

  /**
   * Build DAG from a structured plan.
   * Convenience method for MissionEngine to populate the DAG from a lead mate's plan.
   */
  static fromPlan(tasks: Array<{
    id: string;
    description: string;
    assignee: string;
    dependsOn?: string[];
    metadata?: Record<string, any>;
  }>): TaskDAG {
    const dag = new TaskDAG();

    for (const t of tasks) {
      dag.addTask({ id: t.id, description: t.description, assignee: t.assignee, metadata: t.metadata });
    }

    for (const t of tasks) {
      if (t.dependsOn) {
        for (const depId of t.dependsOn) {
          dag.addDependency(t.id, depId);
        }
      }
    }

    // Initial readiness check
    dag._refreshReadyStatus();

    return dag;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Get a task by ID. */
  get(taskId: string): TaskNode | undefined {
    return this.nodes.get(taskId);
  }

  /** Get all tasks. */
  getAll(): TaskNode[] {
    return [...this.nodes.values()];
  }

  /** Get tasks that are ready to execute (all deps completed, not yet running). */
  getReadyTasks(): TaskNode[] {
    return [...this.nodes.values()].filter(n => n.status === 'ready');
  }

  /** Get currently running tasks. */
  getRunningTasks(): TaskNode[] {
    return [...this.nodes.values()].filter(n => n.status === 'running');
  }

  /** Check if there are unfinished tasks (pending, ready, or running). */
  hasUnfinished(): boolean {
    return [...this.nodes.values()].some(
      n => n.status === 'pending' || n.status === 'ready' || n.status === 'running'
    );
  }

  /** Get overall DAG status. */
  getStatus(): DAGStatus {
    const status: DAGStatus = { total: 0, pending: 0, ready: 0, running: 0, completed: 0, failed: 0 };
    for (const node of this.nodes.values()) {
      status.total++;
      status[node.status]++;
    }
    return status;
  }

  /**
   * Get the tasks that will be unblocked when `taskId` completes.
   * Useful for generating handoff messages.
   */
  getUnblockedBy(taskId: string): TaskNode[] {
    const task = this.nodes.get(taskId);
    if (!task) return [];

    return task.dependents
      .map(id => this.nodes.get(id)!)
      .filter(dep => {
        // Will be unblocked if all OTHER dependencies are already completed
        return dep.dependencies.every(
          dId => dId === taskId || this.nodes.get(dId)?.status === 'completed'
        );
      });
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  /** Mark a task as running. */
  markRunning(taskId: string): void {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    if (task.status !== 'ready') {
      throw new Error(`Task "${taskId}" is ${task.status}, expected ready`);
    }
    task.status = 'running';
  }

  /**
   * Mark a task as completed and refresh dependents' readiness.
   * Returns the list of newly unblocked tasks.
   */
  markCompleted(taskId: string, result?: any, artifacts?: string[]): TaskNode[] {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    task.status = 'completed';
    task.result = result;
    task.artifacts = artifacts;

    // Check which dependents are now unblocked
    const newlyReady: TaskNode[] = [];
    for (const depId of task.dependents) {
      const dep = this.nodes.get(depId);
      if (!dep || dep.status !== 'pending') continue;

      const allDepsCompleted = dep.dependencies.every(
        dId => this.nodes.get(dId)?.status === 'completed'
      );
      if (allDepsCompleted) {
        dep.status = 'ready';
        newlyReady.push(dep);
      }
    }

    return newlyReady;
  }

  /** Mark a task as failed. */
  markFailed(taskId: string, error?: string): void {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    task.status = 'failed';
    task.result = { error };
  }

  // -------------------------------------------------------------------------
  // Topological sort (for plan display)
  // -------------------------------------------------------------------------

  /**
   * Return tasks in topological order (dependencies before dependents).
   * Throws if the graph contains a cycle.
   */
  topologicalSort(): TaskNode[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: TaskNode[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Cycle detected involving task "${id}"`);

      visiting.add(id);
      const node = this.nodes.get(id)!;
      for (const depId of node.dependencies) {
        visit(depId);
      }
      visiting.delete(id);
      visited.add(id);
      order.push(node);
    };

    for (const id of this.nodes.keys()) {
      visit(id);
    }

    return order;
  }

  /**
   * Return a human-readable DAG summary for display or injection into prompts.
   */
  toProgressString(): string {
    const statusIcon: Record<TaskStatus, string> = {
      pending: '⏳',
      ready: '🟡',
      running: '🔄',
      completed: '✅',
      failed: '❌',
    };

    const sorted = this.topologicalSort();
    return sorted.map(node => {
      const icon = statusIcon[node.status];
      const deps = node.dependencies.length > 0
        ? ` (等待: ${node.dependencies.join(', ')})`
        : '';
      return `${icon} ${node.id} — ${node.assignee} — ${node.description}${deps}`;
    }).join('\n');
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** Refresh ready status for all pending tasks (called after DAG construction). */
  private _refreshReadyStatus(): void {
    for (const node of this.nodes.values()) {
      if (node.status !== 'pending') continue;
      const allDepsCompleted = node.dependencies.length === 0 ||
        node.dependencies.every(dId => this.nodes.get(dId)?.status === 'completed');
      if (allDepsCompleted) {
        node.status = 'ready';
      }
    }
  }
}
