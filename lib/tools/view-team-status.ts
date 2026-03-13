/**
 * ViewTeamStatusTool — team-aware progress visibility for medium (Agent Teams) mode.
 *
 * Wraps TeamCoordinator.getTeamStatus() and Blackboard state into a single
 * structured view so the Architect (and team agents) can observe:
 *   - Which agents are on the team and their current status
 *   - Task progress (pending / in_progress / completed)
 *   - Blackboard entries summary (key, type, author, value preview)
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { teamCoordinator } from '@/lib/services/team-coordinator';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import type { Blackboard } from '@/lib/blackboard/blackboard';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ViewTeamStatusInputSchema = z.object({
  team_id: z.string().optional().describe(
    'Team ID to query. Omit to use the default team associated with this execution.',
  ),
});

type ViewTeamStatusInput = z.infer<typeof ViewTeamStatusInputSchema>;

interface BlackboardSummaryEntry {
  key: string;
  type: string;
  author: string;
  preview: string;
}

interface ViewTeamStatusOutput {
  team_name: string;
  status: string;
  agents: Array<{ name: string; status: string; current_task?: string }>;
  tasks: Array<{ id: string; subject: string; status: string; owner?: string }>;
  blackboard_summary: BlackboardSummaryEntry[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ViewTeamStatusTool extends BaseTool<ViewTeamStatusInput, ViewTeamStatusOutput> {
  name = 'view_team_status';
  description =
    'View the current status of the agent team: member states, task progress, and ' +
    'blackboard entries. Use this to coordinate work, check what other agents have ' +
    'completed, and decide next steps.';
  schema = ViewTeamStatusInputSchema;

  private defaultTeamId: string;
  private blackboard?: Blackboard;

  constructor(teamId: string, blackboard?: Blackboard) {
    super();
    this.defaultTeamId = teamId;
    this.blackboard = blackboard;
  }

  protected async _run(input: ViewTeamStatusInput): Promise<ViewTeamStatusOutput> {
    const teamId = input.team_id || this.defaultTeamId;

    // --- Team status from coordinator ---
    const teamStatus = await teamCoordinator.getTeamStatus(teamId);

    // --- Task list from DB ---
    let tasks: ViewTeamStatusOutput['tasks'] = [];
    if (supabaseConfigured) {
      try {
        const { data } = await supabase
          .from('team_tasks')
          .select('id, subject, status, owner')
          .eq('team_id', teamId);
        if (data) {
          tasks = data.map((t: any) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            owner: t.owner ?? undefined,
          }));
        }
      } catch {
        // Tasks may not exist yet — not fatal
      }
    }

    // --- Blackboard summary ---
    const blackboardSummary: BlackboardSummaryEntry[] = [];
    if (this.blackboard) {
      const entries = this.blackboard.query({});
      for (const entry of entries) {
        const valueStr = typeof entry.value === 'string'
          ? entry.value
          : JSON.stringify(entry.value);
        blackboardSummary.push({
          key: entry.key,
          type: entry.type,
          author: entry.author,
          preview: valueStr.length > 200 ? valueStr.slice(0, 200) + '...' : valueStr,
        });
      }
    }

    return {
      team_name: teamStatus.team_name,
      status: teamStatus.status,
      agents: teamStatus.agents.map(a => ({
        name: a.name,
        status: a.status,
        current_task: a.current_task,
      })),
      tasks,
      blackboard_summary: blackboardSummary,
    };
  }
}
