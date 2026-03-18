/**
 * MissionEngine — DAG-driven multi-mate mission execution engine.
 *
 * Implements the 7-phase Mission lifecycle:
 *   Inception → Formation → Planning → Execution → Review → Delivery → Archival
 *
 * Key design:
 *   - DAG scheduler (not Promise.all) respects task dependencies
 *   - Mate-to-mate handoff with natural language summaries
 *   - Shared Mission Blackboard for inter-mate state
 *   - Lead mate (包工头) generates plan and coordinates
 *   - User receives progress updates via SSE channel
 */

import crypto from 'crypto';
import type { MateDefinition, MissionStatus } from '../core/types';
import type { ChatEvent } from '../core/types';
import { generateJSON } from '../core/llm';
import { Blackboard } from '../blackboard/blackboard';
import { getMateRegistry } from './mate-registry';
import { mateMessageQueue } from './mate-message-queue';
import { TaskDAG, type TaskNode } from './task-dag';
import { wakeMate, hibernateMate, type AwakenedMate } from './mate-lifecycle';
import { workspaceManager } from '../sandbox/workspace-manager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MissionConfig {
  /** Source conversation ID. */
  conversationId: string;
  /** Project ID (optional). */
  projectId?: string;
  /** Mission title. */
  title: string;
  /** Full mission description / requirements. */
  description: string;
  /** State summary from chat (context compaction). */
  stateSummary?: string;
  /** User-specified lead mate name. */
  suggestedLead?: string;
  /** Source channel. */
  channel?: string;
  /** Workspace search directories for MateRegistry. */
  searchDirs?: string[];
  /** SSE push function — streams events back to the client. */
  pushEvent: (event: ChatEvent) => void;
}

interface RunningMate {
  awakened: AwakenedMate;
  taskNode: TaskNode;
  promise: Promise<MateResult>;
}

interface MateResult {
  taskId: string;
  mateName: string;
  success: boolean;
  result: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// MissionEngine
// ---------------------------------------------------------------------------

export class MissionEngine {
  private config: MissionConfig;
  private missionId: string;
  private dag: TaskDAG | null = null;
  private blackboard: Blackboard;
  private running = new Map<string, RunningMate>();
  private leadMate: MateDefinition | null = null;
  private teamMates: MateDefinition[] = [];
  private workspace: { localPath: string } | null = null;
  private status: MissionStatus = 'inception';

  constructor(config: MissionConfig) {
    this.config = config;
    this.missionId = crypto.randomUUID();
    this.blackboard = new Blackboard(this.missionId, config.projectId);
  }

  /** Run the full mission lifecycle. Returns summary of all results. */
  async run(): Promise<string> {
    try {
      // Phase 1: Inception
      await this.inception();

      // Phase 2: Formation
      await this.formation();

      // Phase 3: Planning
      await this.planning();

      // Phase 4: Execution (DAG-driven)
      await this.execution();

      // Phase 5: Review
      const reviewResult = await this.review();

      // Phase 6: Delivery
      this.delivery(reviewResult);

      // Phase 7: Archival
      this.archival();

      return reviewResult;
    } catch (err: any) {
      this.setStatus('cancelled');
      this.push({ type: 'error', data: { message: `Mission failed: ${err.message}` } });
      throw err;
    } finally {
      mateMessageQueue.clear(this.missionId);
    }
  }

  // =========================================================================
  // Phase 1: Inception
  // =========================================================================

  private async inception(): Promise<void> {
    this.setStatus('inception');

    // Create workspace
    const dirName = `mission-${this.missionId.slice(0, 8)}`;
    try {
      this.workspace = await workspaceManager.createLocal({
        projectId: this.config.projectId || this.missionId,
        localDir: dirName,
      });
    } catch (err: any) {
      console.warn('[MissionEngine] Workspace creation failed:', err.message);
    }

    // Write mission context to blackboard
    await this.blackboard.write({
      key: `mission::${this.missionId}::description`,
      value: this.config.description,
      type: 'context',
      author: 'system',
    });

    if (this.config.stateSummary) {
      await this.blackboard.write({
        key: `mission::${this.missionId}::state-summary`,
        value: this.config.stateSummary,
        type: 'context',
        author: 'system',
      });
    }

    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'inception',
        title: this.config.title,
      },
    });
  }

  // =========================================================================
  // Phase 2: Formation (select lead + assemble team)
  // =========================================================================

  private async formation(): Promise<void> {
    this.setStatus('formation');
    const searchDirs = this.config.searchDirs || ['.'];
    const registry = getMateRegistry(searchDirs);

    // Select lead mate (包工头)
    this.leadMate = registry.matchForLead(
      this.config.description,
      this.config.suggestedLead,
    );

    // Select team mates via LLM analysis
    const teamPlan = await this.analyzeTeamNeeds();

    // Match mates from registry
    for (const need of teamPlan) {
      const mate = registry.matchForTask(need.description, need.suggestedMate);
      if (mate && !this.teamMates.some(m => m.name === mate.name)) {
        this.teamMates.push(mate);
      }
    }

    // If no mates found from registry, create dynamic definitions
    if (this.teamMates.length === 0) {
      this.teamMates = teamPlan.map(need => this.createDynamicMate(need));
    }

    // Ensure queues for all mates
    for (const mate of this.teamMates) {
      mateMessageQueue.ensureQueue(this.missionId, mate.name);
    }

    // Emit team roster
    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'formation',
        lead: this.leadMate?.name || 'auto',
        agents: this.teamMates.map(m => ({
          name: m.name,
          role: m.description,
          status: 'pending',
        })),
      },
    });
  }

  /**
   * Use LLM to analyze what team members are needed.
   */
  private async analyzeTeamNeeds(): Promise<Array<{
    name: string;
    role: string;
    description: string;
    suggestedMate?: string;
  }>> {
    try {
      const result = await generateJSON(
        `You are a project manager analyzing a task to determine what team members are needed.

Respond with JSON: { "teammates": [{ "name": "slug-name", "role": "one-line role", "description": "what they need to do" }] }

Rules:
- Names: descriptive slugs (e.g., "frontend-dev", "api-designer", "qa-engineer")
- Maximum 5 teammates
- Think about real dependencies: who needs to finish before whom
- Include a QA/review role if the task involves code changes`,
        this.config.description.slice(0, 5000),
        { agentName: 'mission-planner' },
      );
      return result?.teammates || [];
    } catch {
      return [{
        name: 'general-engineer',
        role: 'Full-stack engineer',
        description: this.config.description.slice(0, 1000),
      }];
    }
  }

  /**
   * Create a dynamic MateDefinition when no registered mate matches.
   */
  private createDynamicMate(need: { name: string; role: string; description: string }): MateDefinition {
    return {
      id: need.name,
      name: need.name,
      display_name: need.name,
      description: need.role,
      domains: [],
      tools_allow: [],
      tools_deny: [],
      model: 'inherit',
      system_prompt: `You are ${need.name}, a ${need.role}. Your job: ${need.description}`,
      can_lead: false,
      status: 'idle',
      source: 'dynamic',
      metadata: { dynamic: true, mission_id: this.missionId },
    };
  }

  // =========================================================================
  // Phase 3: Planning (lead mate generates task DAG)
  // =========================================================================

  private async planning(): Promise<void> {
    this.setStatus('planning');

    const mateNames = this.teamMates.map(m => m.name);
    const mateDescriptions = this.teamMates
      .map(m => `- ${m.name}: ${m.description}`)
      .join('\n');

    try {
      const plan = await generateJSON(
        `You are a lead engineer creating an execution plan for a mission.

Available team members:
${mateDescriptions}

Create a task dependency graph (DAG). Respond with JSON:
{
  "tasks": [
    {
      "id": "task-slug",
      "description": "What needs to be done",
      "assignee": "mate-name",
      "dependsOn": ["other-task-id"]
    }
  ]
}

Rules:
- Each task assigned to exactly one team member from the list
- Use dependsOn to express ordering: QA depends on dev tasks, integration depends on both frontend and backend, etc.
- Tasks with no dependencies can run in parallel
- Keep tasks atomic and clear
- Maximum 10 tasks`,
        this.config.description.slice(0, 5000),
        { agentName: 'mission-planner' },
      );

      const tasks = plan?.tasks || [];

      // Validate assignees exist in team
      const validTasks = tasks.map((t: any) => ({
        ...t,
        assignee: mateNames.includes(t.assignee)
          ? t.assignee
          : mateNames[0] || 'general-engineer',
      }));

      this.dag = TaskDAG.fromPlan(validTasks);
    } catch {
      // Fallback: one task per mate, no dependencies
      const fallbackTasks = this.teamMates.map((m, i) => ({
        id: `task-${i + 1}`,
        description: `Complete your assigned portion of: ${this.config.description.slice(0, 200)}`,
        assignee: m.name,
      }));
      this.dag = TaskDAG.fromPlan(fallbackTasks);
    }

    // Write plan to blackboard
    await this.blackboard.write({
      key: `mission::${this.missionId}::plan`,
      value: this.dag.toProgressString(),
      type: 'artifact',
      author: this.leadMate?.name || 'system',
    });

    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'planning',
        plan: this.dag.toProgressString(),
        dag_status: this.dag.getStatus(),
      },
    });
  }

  // =========================================================================
  // Phase 4: Execution (DAG-driven scheduler)
  // =========================================================================

  private async execution(): Promise<void> {
    this.setStatus('execution');

    if (!this.dag) throw new Error('No DAG — planning phase was skipped');

    while (this.dag.hasUnfinished()) {
      // 1. Find ready tasks that aren't already running
      const readyTasks = this.dag.getReadyTasks();

      // 2. Launch mates for ready tasks
      for (const task of readyTasks) {
        if (this.running.has(task.id)) continue;
        this.launchMateForTask(task);
      }

      // 3. If nothing is running and nothing is ready, we're stuck
      if (this.running.size === 0 && readyTasks.length === 0) {
        const status = this.dag.getStatus();
        if (status.failed > 0) {
          throw new Error(`Mission stuck: ${status.failed} tasks failed, blocking dependents`);
        }
        break;
      }

      // 4. Wait for any running mate to complete
      if (this.running.size > 0) {
        const completed = await this.waitForAnyCompletion();
        await this.handleCompletion(completed);
      }
    }
  }

  /**
   * Launch a mate agent for a specific task.
   */
  private launchMateForTask(task: TaskNode): void {
    const mateDef = this.teamMates.find(m => m.name === task.assignee);
    if (!mateDef) {
      this.dag!.markFailed(task.id, `No mate found for assignee "${task.assignee}"`);
      return;
    }

    this.dag!.markRunning(task.id);

    // Wake the mate
    const awakened = wakeMate({
      mateDef,
      missionId: this.missionId,
      missionContext: this.config.description,
      taskDescription: task.description,
      blackboard: this.blackboard,
      workspace: this.workspace?.localPath,
      projectId: this.config.projectId,
    });

    this.push({
      type: 'sub_agent_start',
      data: { agent_name: mateDef.name, task: task.description, task_id: task.id },
    });

    const startTime = Date.now();

    // Run mate with streaming callbacks
    const promise = awakened.agent.run(task.description, {
      projectId: this.config.projectId,
      workspacePath: this.workspace?.localPath,
      onToken: (token: string) => {
        this.push({ type: 'mate_token' as any, data: { agent: mateDef.name, content: token } });
      },
      onToolCallStart: (params: any) => {
        this.push({ type: 'tool_call_start', data: { ...params, agent: mateDef.name } });
      },
      onToolCallEnd: (params: any) => {
        this.push({ type: 'tool_call_end', data: { ...params, agent: mateDef.name } });
      },
      onUserMessageCheck: async () => {
        return mateMessageQueue.dequeueFormatted(this.missionId, mateDef.name);
      },
    }).then((result): MateResult => {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      return {
        taskId: task.id,
        mateName: mateDef.name,
        success: true,
        result: resultStr,
        durationMs: Date.now() - startTime,
      };
    }).catch((err): MateResult => {
      return {
        taskId: task.id,
        mateName: mateDef.name,
        success: false,
        result: err.message,
        durationMs: Date.now() - startTime,
      };
    });

    this.running.set(task.id, { awakened, taskNode: task, promise });
  }

  /**
   * Wait for any running mate to complete (Promise.race).
   */
  private async waitForAnyCompletion(): Promise<MateResult> {
    const entries = [...this.running.entries()];
    const result = await Promise.race(entries.map(([, rm]) => rm.promise));
    return result;
  }

  /**
   * Handle a completed mate: update DAG, send handoff messages, hibernate.
   */
  private async handleCompletion(completed: MateResult): Promise<void> {
    const runningEntry = this.running.get(completed.taskId);
    this.running.delete(completed.taskId);

    if (completed.success) {
      // Mark completed in DAG — returns newly unblocked tasks
      const newlyReady = this.dag!.markCompleted(completed.taskId, completed.result);

      // Send handoff messages to newly unblocked mates
      for (const unblockedTask of newlyReady) {
        // Generate handoff summary (simplified — use result directly)
        const handoffContent = `我（${completed.mateName}）已完成任务「${this.dag!.get(completed.taskId)?.description}」。\n\n主要产出：\n${completed.result.slice(0, 500)}`;

        mateMessageQueue.enqueueHandoff(
          this.missionId,
          unblockedTask.assignee,
          completed.mateName,
          {
            content: handoffContent,
            taskId: completed.taskId,
          },
        );

        // Push handoff event to frontend
        this.push({
          type: 'team_comms',
          data: {
            mission_id: this.missionId,
            type: 'handoff',
            from: completed.mateName,
            to: unblockedTask.assignee,
            task_id: completed.taskId,
            content: handoffContent.slice(0, 200),
          },
        });
      }

      this.push({
        type: 'sub_agent_complete',
        data: {
          agent_name: completed.mateName,
          task_id: completed.taskId,
          status: 'success',
          duration_ms: completed.durationMs,
        },
      });
    } else {
      this.dag!.markFailed(completed.taskId, completed.result);
      this.push({
        type: 'sub_agent_complete',
        data: {
          agent_name: completed.mateName,
          task_id: completed.taskId,
          status: 'failed',
          error: completed.result,
          duration_ms: completed.durationMs,
        },
      });
    }

    // Hibernate the mate
    if (runningEntry) {
      hibernateMate(runningEntry.awakened);
    }

    // Push progress update
    this.pushProgress();
  }

  // =========================================================================
  // Phase 5: Review
  // =========================================================================

  private async review(): Promise<string> {
    this.setStatus('review');

    if (!this.dag) return 'No tasks were executed.';

    const allTasks = this.dag.getAll();
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const failedTasks = allTasks.filter(t => t.status === 'failed');

    // Build review summary
    const sections = completedTasks.map(t => {
      const resultStr = typeof t.result === 'string' ? t.result : JSON.stringify(t.result);
      return `### ${t.assignee} — ${t.description}\n${resultStr.slice(0, 1000)}`;
    });

    if (failedTasks.length > 0) {
      sections.push(`### ❌ 失败任务\n${failedTasks.map(t =>
        `- ${t.assignee}: ${t.description} — ${t.result?.error || 'unknown error'}`
      ).join('\n')}`);
    }

    const summary = `# Mission 执行报告: ${this.config.title}

## 概要
- 总任务: ${allTasks.length}
- 完成: ${completedTasks.length}
- 失败: ${failedTasks.length}

## 各 Mate 产出

${sections.join('\n\n')}`;

    // Write to blackboard
    await this.blackboard.write({
      key: `mission::${this.missionId}::review-result`,
      value: summary,
      type: 'artifact',
      author: this.leadMate?.name || 'system',
    });

    return summary;
  }

  // =========================================================================
  // Phase 6: Delivery
  // =========================================================================

  private delivery(reviewResult: string): void {
    this.setStatus('delivery');

    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'delivery',
        summary: reviewResult.slice(0, 3000),
        dag_status: this.dag?.getStatus(),
      },
    });
  }

  // =========================================================================
  // Phase 7: Archival
  // =========================================================================

  private archival(): void {
    this.setStatus('archival');

    // Clean up message queues
    mateMessageQueue.clear(this.missionId);

    // Future: persist blackboard essentials to vault
    // Future: persist mate working memory highlights to vault

    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'archival',
        final: true,
      },
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private setStatus(status: MissionStatus): void {
    this.status = status;
  }

  private push(event: ChatEvent): void {
    try {
      this.config.pushEvent(event);
    } catch {
      // Channel may be closed
    }
  }

  private pushProgress(): void {
    if (!this.dag) return;
    this.push({
      type: 'team_update',
      data: {
        mission_id: this.missionId,
        status: 'execution',
        progress: this.dag.toProgressString(),
        dag_status: this.dag.getStatus(),
      },
    });
  }

  /** Get the mission ID. */
  getMissionId(): string {
    return this.missionId;
  }
}
