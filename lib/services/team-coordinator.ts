/**
 * Team Coordinator — manages Agent Team lifecycle and communication.
 *
 * Core dispatch layer uses DB (agent_teams, team_tasks, agent_mailbox)
 * + Message Bus for real-time notifications.
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { messageBus } from '@/connectors/bus/message-bus';
import type {
  AgentTeam,
  AgentMailMessage,
  TeamTask,
  TeamStatus,
  AgentStatus,
  UserIntervention,
  MailboxMessageType,
} from '@/lib/core/types';

interface TeamConfig {
  conversationId: string;
  projectId?: string;
  teamName: string;
  leadAgent: string;
  members: string[];
  executionMode: string;
}

/** Shape of the agent_statuses map inside config JSONB. */
interface AgentStatusRecord {
  status: AgentStatus['status'];
  current_task?: string;
}

const DEFAULT_MAILBOX_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TeamCoordinator {
  /**
   * Form a new agent team.
   */
  async formTeam(config: TeamConfig): Promise<AgentTeam> {
    // Build initial agent_statuses — all members start as idle
    const agentStatuses: Record<string, AgentStatusRecord> = {};
    for (const member of config.members) {
      agentStatuses[member] = { status: 'idle' };
    }

    const teamData = {
      conversation_id: config.conversationId,
      project_id: config.projectId || null,
      team_name: config.teamName,
      lead_agent: config.leadAgent,
      status: 'forming' as const,
      config: {
        members: config.members,
        execution_mode: config.executionMode,
        agent_statuses: agentStatuses,
      },
    };

    if (supabaseConfigured) {
      const { data, error } = await supabase
        .from('agent_teams')
        .insert(teamData)
        .select()
        .single();

      if (error) throw new Error(`Failed to create team: ${error.message}`);

      // Publish team formation event
      messageBus.publish({
        from: 'team-coordinator',
        channel: 'team-comms',
        type: 'agent_start',
        payload: { team_id: data.id, team_name: config.teamName, members: config.members },
      });

      return data as AgentTeam;
    }

    // Fallback
    return {
      id: crypto.randomUUID(),
      ...teamData,
      created_at: new Date().toISOString(),
    } as AgentTeam;
  }

  // -------------------------------------------------------------------------
  // Agent Status Management
  // -------------------------------------------------------------------------

  /**
   * Update a single agent's status within a team.
   */
  async updateAgentStatus(
    teamId: string,
    agentName: string,
    status: AgentStatus['status'],
    currentTask?: string,
  ): Promise<void> {
    const team = await this.getTeam(teamId);
    if (!team) throw new Error('Team not found');

    const config = (team.config as any) || {};
    const agentStatuses: Record<string, AgentStatusRecord> = config.agent_statuses || {};

    agentStatuses[agentName] = { status, current_task: currentTask };

    if (supabaseConfigured) {
      const { error } = await supabase
        .from('agent_teams')
        .update({ config: { ...config, agent_statuses: agentStatuses } })
        .eq('id', teamId);

      if (error) throw new Error(`Failed to update agent status: ${error.message}`);
    }

    // Publish real-time notification
    messageBus.publish({
      from: 'team-coordinator',
      channel: 'team-comms',
      type: 'agent_log',
      payload: {
        team_id: teamId,
        agent_name: agentName,
        status,
        current_task: currentTask,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  /**
   * Assign a task within a team.
   */
  async assignTask(teamId: string, task: { subject: string; description?: string; owner?: string }): Promise<TeamTask> {
    const taskData = {
      team_id: teamId,
      subject: task.subject,
      description: task.description || null,
      owner: task.owner || null,
      status: 'pending' as const,
      blocks: [],
      blocked_by: [],
    };

    if (supabaseConfigured) {
      const { data, error } = await supabase
        .from('team_tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);

      // Notify assigned agent
      if (task.owner) {
        await this.sendMessage(teamId, {
          from: 'lead',
          to: task.owner,
          type: 'task_assignment',
          payload: { task_id: data.id, subject: task.subject, description: task.description },
        });
      }

      // Publish task update
      messageBus.publish({
        from: 'team-coordinator',
        channel: 'team-task-update',
        type: 'task_update',
        payload: { team_id: teamId, task: data },
      });

      return data as TeamTask;
    }

    return {
      id: crypto.randomUUID(),
      ...taskData,
      result: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as TeamTask;
  }

  /**
   * Update task status with dependency enforcement.
   *
   * - pending → in_progress: checks all blocked_by tasks are completed
   * - in_progress → completed: stores result, checks if this unblocks other tasks
   */
  async updateTaskStatus(
    teamId: string,
    taskId: string,
    status: TeamTask['status'],
    result?: Record<string, any>,
  ): Promise<TeamTask> {
    if (!supabaseConfigured) {
      return {
        id: taskId,
        team_id: teamId,
        subject: '',
        description: null,
        owner: null,
        status,
        blocks: [],
        blocked_by: [],
        result: result || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as TeamTask;
    }

    // Fetch current task
    const { data: task, error: fetchError } = await supabase
      .from('team_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('team_id', teamId)
      .single();

    if (fetchError || !task) throw new Error('Task not found');

    // Dependency check: pending → in_progress requires all blockers completed
    if (status === 'in_progress' && task.status === 'pending') {
      const blockedBy: string[] = task.blocked_by || [];
      if (blockedBy.length > 0) {
        const { data: blockers } = await supabase
          .from('team_tasks')
          .select('id, status')
          .in('id', blockedBy);

        const incomplete = (blockers || []).filter(b => b.status !== 'completed');
        if (incomplete.length > 0) {
          const ids = incomplete.map(b => b.id).join(', ');
          throw new Error(`Cannot start task: blocked by incomplete tasks [${ids}]`);
        }
      }
    }

    // Build update payload
    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (result !== undefined) {
      updatePayload.result = result;
    }

    const { data: updated, error: updateError } = await supabase
      .from('team_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to update task: ${updateError.message}`);

    // Publish task update event
    messageBus.publish({
      from: 'team-coordinator',
      channel: 'team-task-update',
      type: 'task_update',
      payload: { team_id: teamId, task: updated },
    });

    return updated as TeamTask;
  }

  /**
   * Set dependency: taskId is blocked by blockerIds.
   * Maintains both sides: target's blocked_by and blockers' blocks arrays.
   */
  async setTaskDependencies(
    teamId: string,
    taskId: string,
    blockedBy: string[],
  ): Promise<void> {
    if (!supabaseConfigured) return;

    // Update target task's blocked_by
    const { data: task, error: fetchError } = await supabase
      .from('team_tasks')
      .select('blocked_by')
      .eq('id', taskId)
      .eq('team_id', teamId)
      .single();

    if (fetchError || !task) throw new Error('Task not found');

    const { error: updateError } = await supabase
      .from('team_tasks')
      .update({ blocked_by: blockedBy, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (updateError) throw new Error(`Failed to set blocked_by: ${updateError.message}`);

    // Update each blocker's blocks array to include taskId
    for (const blockerId of blockedBy) {
      const { data: blocker } = await supabase
        .from('team_tasks')
        .select('blocks')
        .eq('id', blockerId)
        .eq('team_id', teamId)
        .single();

      if (blocker) {
        const currentBlocks: string[] = blocker.blocks || [];
        if (!currentBlocks.includes(taskId)) {
          await supabase
            .from('team_tasks')
            .update({ blocks: [...currentBlocks, taskId], updated_at: new Date().toISOString() })
            .eq('id', blockerId);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Mailbox
  // -------------------------------------------------------------------------

  /**
   * Send a message between agents via the mailbox.
   */
  async sendMessage(
    teamId: string,
    msg: { from: string; to: string; type: MailboxMessageType; payload: any },
  ): Promise<void> {
    if (supabaseConfigured) {
      await supabase.from('agent_mailbox').insert({
        team_id: teamId,
        from_agent: msg.from,
        to_agent: msg.to,
        message_type: msg.type,
        payload: msg.payload,
      });
    }

    // Also publish to bus for real-time updates
    messageBus.publish({
      from: msg.from,
      to: msg.to,
      channel: 'team-comms',
      type: 'agent_log',
      payload: { team_id: teamId, message_type: msg.type, ...msg.payload },
    });
  }

  /**
   * Broadcast a message to all team members.
   */
  async broadcast(teamId: string, from: string, payload: any): Promise<void> {
    const team = await this.getTeam(teamId);
    if (!team) return;

    const members = (team.config as any)?.members || [];

    for (const member of members) {
      await this.sendMessage(teamId, {
        from,
        to: member,
        type: 'broadcast',
        payload,
      });
    }
  }

  /**
   * Mark messages as read for a specific agent.
   * Returns the number of messages marked.
   */
  async markAsRead(teamId: string, toAgent: string): Promise<number> {
    if (!supabaseConfigured) return 0;

    const { data, error } = await supabase
      .from('agent_mailbox')
      .update({ read: true })
      .eq('team_id', teamId)
      .eq('to_agent', toAgent)
      .eq('read', false)
      .select('id');

    if (error) throw new Error(`Failed to mark messages as read: ${error.message}`);
    return data?.length ?? 0;
  }

  /**
   * Clean up old mailbox messages (older than retentionMs, default 24h).
   * Returns the number of messages deleted.
   */
  async cleanupMailbox(teamId: string, retentionMs: number = DEFAULT_MAILBOX_RETENTION_MS): Promise<number> {
    if (!supabaseConfigured) return 0;

    const cutoff = new Date(Date.now() - retentionMs).toISOString();

    const { data, error } = await supabase
      .from('agent_mailbox')
      .delete()
      .eq('team_id', teamId)
      .lt('created_at', cutoff)
      .select('id');

    if (error) throw new Error(`Failed to cleanup mailbox: ${error.message}`);
    return data?.length ?? 0;
  }

  /**
   * Clear all mailbox messages for a team (called on disband).
   */
  async clearMailbox(teamId: string): Promise<void> {
    if (!supabaseConfigured) return;

    const { error } = await supabase
      .from('agent_mailbox')
      .delete()
      .eq('team_id', teamId);

    if (error) throw new Error(`Failed to clear mailbox: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Team Status & Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Get full team status including agent states and task progress.
   */
  async getTeamStatus(teamId: string): Promise<TeamStatus> {
    const team = await this.getTeam(teamId);
    if (!team) throw new Error('Team not found');

    const config = (team.config as any) || {};
    const members: string[] = config.members || [];
    const agentStatuses: Record<string, AgentStatusRecord> = config.agent_statuses || {};

    // Build agent status list from real data, fallback to idle
    const agents: AgentStatus[] = members.map((name: string) => {
      const record = agentStatuses[name];
      return {
        name,
        status: record?.status ?? ('idle' as const),
        current_task: record?.current_task,
      };
    });

    let tasksCompleted = 0;
    let tasksTotal = 0;

    if (supabaseConfigured) {
      const { data: tasks } = await supabase
        .from('team_tasks')
        .select('status')
        .eq('team_id', teamId);

      if (tasks) {
        tasksTotal = tasks.length;
        tasksCompleted = tasks.filter(t => t.status === 'completed').length;
      }
    }

    return {
      team_id: teamId,
      team_name: team.team_name,
      status: team.status,
      agents,
      tasks_completed: tasksCompleted,
      tasks_total: tasksTotal,
    };
  }

  /**
   * Disband a team: update status to 'disbanded' and clear all mailbox messages.
   */
  async disbandTeam(teamId: string): Promise<void> {
    if (supabaseConfigured) {
      const { error } = await supabase
        .from('agent_teams')
        .update({ status: 'disbanded' })
        .eq('id', teamId);

      if (error) throw new Error(`Failed to disband team: ${error.message}`);
    }

    await this.clearMailbox(teamId);

    messageBus.publish({
      from: 'team-coordinator',
      channel: 'team-comms',
      type: 'agent_complete',
      payload: { team_id: teamId, status: 'disbanded' },
    });
  }

  /**
   * Handle user intervention in team execution.
   */
  async intervene(teamId: string, intervention: UserIntervention): Promise<void> {
    switch (intervention.type) {
      case 'pause_agent':
        await this.sendMessage(teamId, {
          from: 'user',
          to: intervention.target_agent || 'lead',
          type: 'message',
          payload: { action: 'pause', instruction: intervention.instruction },
        });
        break;

      case 'resume_agent':
        await this.sendMessage(teamId, {
          from: 'user',
          to: intervention.target_agent || 'lead',
          type: 'message',
          payload: { action: 'resume', instruction: intervention.instruction },
        });
        break;

      case 'send_instruction':
        await this.broadcast(teamId, 'user', {
          action: 'instruction',
          instruction: intervention.instruction,
        });
        break;

      case 'cancel_task':
        if (intervention.target_task) {
          await this.updateTaskStatus(teamId, intervention.target_task, 'deleted');
        }
        break;
    }

    // Publish intervention acknowledgment
    messageBus.publish({
      from: 'team-coordinator',
      channel: 'intervention-ack',
      type: 'agent_log',
      payload: { team_id: teamId, intervention },
    });
  }

  /**
   * Get a team by ID.
   */
  private async getTeam(teamId: string): Promise<AgentTeam | null> {
    if (!supabaseConfigured) return null;

    const { data } = await supabase
      .from('agent_teams')
      .select('*')
      .eq('id', teamId)
      .single();

    return data as AgentTeam | null;
  }
}

/** Singleton instance. */
export const teamCoordinator = new TeamCoordinator();
