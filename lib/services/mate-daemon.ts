/**
 * MateDaemon — Always-on Mate execution service.
 *
 * Some mates need to run continuously (e.g., signal monitors, scheduled reporters).
 * MateDaemon manages their lifecycle:
 *   1. Start: wake mate, begin a long-running ReAct loop with periodic triggers
 *   2. Pause: hibernate mate, save state
 *   3. Resume: wake mate with restored state
 *   4. Stop: hibernate + cleanup
 *
 * Implementation: lightweight in-memory daemon. Each daemon mate runs inside
 * a setInterval loop that fires its trigger function and feeds results into
 * the mate's ReAct loop.
 *
 * This is NOT a cron scheduler — it's a persistent agent that stays awake
 * and reacts to triggers. For cron-like scheduling, use the trigger system.
 */

import type { MateDefinition } from '../core/types';
import { Blackboard } from '../blackboard/blackboard';
import { wakeMate, hibernateMate, type AwakenedMate } from './mate-lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DaemonTrigger = () => Promise<string | null>;

export interface DaemonConfig {
  mateDef: MateDefinition;
  /** Mission ID this daemon belongs to (or a synthetic one for standalone). */
  missionId: string;
  /** How the daemon is triggered. */
  trigger: DaemonTrigger;
  /** Trigger interval in ms (default: 60s). */
  intervalMs?: number;
  /** Shared blackboard for state. */
  blackboard: Blackboard;
  /** Workspace path. */
  workspace?: string;
  projectId?: string;
  /** Max ReAct loops per trigger cycle. */
  maxLoopsPerCycle?: number;
  /** Callback for daemon events. */
  onEvent?: (event: DaemonEvent) => void;
}

export interface DaemonEvent {
  type: 'started' | 'trigger_fired' | 'cycle_complete' | 'paused' | 'stopped' | 'error';
  mateName: string;
  message?: string;
  timestamp: number;
}

type DaemonStatus = 'idle' | 'running' | 'paused' | 'stopped';

interface DaemonInstance {
  config: DaemonConfig;
  status: DaemonStatus;
  awakened: AwakenedMate | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  cycleCount: number;
  lastTriggerAt: number | null;
}

// ---------------------------------------------------------------------------
// Daemon Service
// ---------------------------------------------------------------------------

class MateDaemonService {
  private daemons = new Map<string, DaemonInstance>();

  /**
   * Start a daemon for a mate. Returns the daemon key.
   */
  start(config: DaemonConfig): string {
    const key = this.daemonKey(config.missionId, config.mateDef.name);

    // Prevent double-start
    if (this.daemons.has(key)) {
      const existing = this.daemons.get(key)!;
      if (existing.status === 'running') return key;
      // If paused, resume instead
      if (existing.status === 'paused') {
        this.resume(key);
        return key;
      }
    }

    const instance: DaemonInstance = {
      config,
      status: 'idle',
      awakened: null,
      intervalHandle: null,
      cycleCount: 0,
      lastTriggerAt: null,
    };
    this.daemons.set(key, instance);

    // Wake is async — start loop after wake completes
    wakeMate({
      mateDef: config.mateDef,
      missionId: config.missionId,
      missionContext: `You are running as an always-on daemon. You will receive periodic triggers and should react accordingly.`,
      taskDescription: `Daemon mode: respond to triggers from your monitoring scope.`,
      blackboard: config.blackboard,
      workspace: config.workspace,
      projectId: config.projectId,
      maxLoops: config.maxLoopsPerCycle ?? 5,
    }).then(awakened => {
      instance.awakened = awakened;
      instance.status = 'running';

      const intervalMs = config.intervalMs ?? 60_000;
      instance.intervalHandle = setInterval(() => {
        this.executeCycle(key).catch(err => {
          this.emitEvent(key, 'error', err.message);
        });
      }, intervalMs);

      this.emitEvent(key, 'started');
    }).catch(err => {
      this.emitEvent(key, 'error', `Wake failed: ${err.message}`);
      this.daemons.delete(key);
    });

    return key;
  }

  /**
   * Pause a running daemon (hibernate mate, stop interval).
   */
  pause(key: string): void {
    const instance = this.daemons.get(key);
    if (!instance || instance.status !== 'running') return;

    if (instance.intervalHandle) {
      clearInterval(instance.intervalHandle);
      instance.intervalHandle = null;
    }

    if (instance.awakened) {
      hibernateMate(instance.awakened);
      instance.awakened = null;
    }

    instance.status = 'paused';
    this.emitEvent(key, 'paused');
  }

  /**
   * Resume a paused daemon.
   */
  resume(key: string): void {
    const instance = this.daemons.get(key);
    if (!instance || instance.status !== 'paused') return;

    // Re-wake the mate (async)
    wakeMate({
      mateDef: instance.config.mateDef,
      missionId: instance.config.missionId,
      missionContext: `You are running as an always-on daemon (resumed). Cycle count: ${instance.cycleCount}.`,
      taskDescription: `Daemon mode: respond to triggers from your monitoring scope.`,
      blackboard: instance.config.blackboard,
      workspace: instance.config.workspace,
      projectId: instance.config.projectId,
      maxLoops: instance.config.maxLoopsPerCycle ?? 5,
    }).then(awakened => {
      instance.awakened = awakened;
      instance.status = 'running';

      const intervalMs = instance.config.intervalMs ?? 60_000;
      instance.intervalHandle = setInterval(() => {
        this.executeCycle(key).catch(err => {
          this.emitEvent(key, 'error', err.message);
        });
      }, intervalMs);

      this.emitEvent(key, 'started', 'Resumed');
    }).catch(err => {
      this.emitEvent(key, 'error', `Resume wake failed: ${err.message}`);
    });
  }

  /**
   * Stop a daemon permanently.
   */
  stop(key: string): void {
    const instance = this.daemons.get(key);
    if (!instance) return;

    if (instance.intervalHandle) {
      clearInterval(instance.intervalHandle);
      instance.intervalHandle = null;
    }

    if (instance.awakened) {
      hibernateMate(instance.awakened);
      instance.awakened = null;
    }

    instance.status = 'stopped';
    this.emitEvent(key, 'stopped');
    this.daemons.delete(key);
  }

  /**
   * Stop all running daemons.
   */
  stopAll(): void {
    for (const key of [...this.daemons.keys()]) {
      this.stop(key);
    }
  }

  /**
   * List all daemon instances with their status.
   */
  list(): Array<{
    key: string;
    mateName: string;
    missionId: string;
    status: DaemonStatus;
    cycleCount: number;
    lastTriggerAt: number | null;
  }> {
    return [...this.daemons.entries()].map(([key, inst]) => ({
      key,
      mateName: inst.config.mateDef.name,
      missionId: inst.config.missionId,
      status: inst.status,
      cycleCount: inst.cycleCount,
      lastTriggerAt: inst.lastTriggerAt,
    }));
  }

  /**
   * Get a specific daemon's status.
   */
  get(key: string): DaemonInstance | undefined {
    return this.daemons.get(key);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async executeCycle(key: string): Promise<void> {
    const instance = this.daemons.get(key);
    if (!instance || instance.status !== 'running' || !instance.awakened) return;

    // Fire trigger
    const triggerResult = await instance.config.trigger();
    instance.lastTriggerAt = Date.now();

    if (!triggerResult) {
      // No trigger content — skip this cycle
      return;
    }

    this.emitEvent(key, 'trigger_fired', triggerResult.slice(0, 200));

    // Feed trigger result into agent
    // Note: BaseAgent.run() creates a new conversation each time.
    // For daemon mode, we feed the trigger as the user message.
    try {
      await instance.awakened.agent.run(triggerResult, {
        projectId: instance.config.projectId,
        workspacePath: instance.config.workspace,
      });
    } catch (err: any) {
      this.emitEvent(key, 'error', `Cycle failed: ${err.message}`);
    }

    instance.cycleCount++;
    this.emitEvent(key, 'cycle_complete', `Cycle #${instance.cycleCount}`);
  }

  private daemonKey(missionId: string, mateName: string): string {
    return `${missionId}::${mateName}`;
  }

  private emitEvent(key: string, type: DaemonEvent['type'], message?: string): void {
    const instance = this.daemons.get(key);
    if (!instance) return;
    instance.config.onEvent?.({
      type,
      mateName: instance.config.mateDef.name,
      message,
      timestamp: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const mateDaemon = new MateDaemonService();
