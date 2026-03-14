/**
 * Daily Report Service — aggregates project execution data for a given day.
 *
 * Queries: tasks, team_tasks, execution_traces, llm_usage, deployments,
 * decisions, projects, conversations.
 *
 * Returns a typed DailyReportData object for the Analyst agent to analyze.
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskDeliverable {
  task_id: string;
  title: string;
  status: string;
  priority: string | null;
  project_id: string | null;
  project_name: string | null;
  affected_files: string[] | null;
  decision_id: string | null;
  created_at: string;
}

export interface TeamTaskDeliverable {
  task_id: string;
  subject: string;
  owner: string | null;
  status: string;
  result: unknown;
  team_id: string;
  team_name: string;
  updated_at: string;
}

export interface TraceWithCost {
  trace_id: string;
  project_id: string | null;
  project_name: string | null;
  stage: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: unknown;
  total_tokens: number;
  total_cost_usd: number;
  agents_involved: string[];
}

export interface DeploymentOutcome {
  deployment_id: string;
  project_id: string | null;
  project_name: string | null;
  pr_number: number;
  pr_url: string;
  state: string;
  deployment_url: string | null;
  created_at: string;
}

export interface DecisionOutcome {
  decision_id: string;
  signal_id: string | null;
  decision_rationale: string;
  result_action: unknown;
  confidence: number | null;
  created_at: string;
}

export interface CostByAgent {
  agent_name: string;
  total_tokens: number;
  total_cost_usd: number;
  call_count: number;
}

export interface CostByProject {
  project_id: string | null;
  project_name: string | null;
  total_tokens: number;
  total_cost_usd: number;
}

export interface ProjectProgress {
  project_id: string;
  name: string;
  status: string;
  total_cost_usd: number;
  tasks_completed: number;
  tasks_total: number;
  traces_completed: number;
  traces_failed: number;
  traces_total: number;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string | null;
  execution_mode: string | null;
  project_id: string | null;
  created_at: string;
}

export interface DailyReportData {
  report_date: string;
  period_start: string;
  period_end: string;

  tasks: TaskDeliverable[];
  team_tasks: TeamTaskDeliverable[];
  traces: TraceWithCost[];
  deployments: DeploymentOutcome[];
  decisions: DecisionOutcome[];

  cost_by_agent: CostByAgent[];
  cost_by_project: CostByProject[];
  total_cost_usd: number;
  total_tokens: number;

  project_progress: ProjectProgress[];
  conversations: ConversationSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toDateRange(date?: string): { start: string; end: string; dateStr: string } {
  const d = date ? new Date(`${date}T00:00:00Z`) : new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const start = `${dateStr}T00:00:00Z`;
  const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { start, end, dateStr };
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

export async function aggregateDailyReport(date?: string): Promise<DailyReportData> {
  if (!supabaseConfigured) {
    const { start, end, dateStr } = toDateRange(date);
    return emptyReport(dateStr, start, end);
  }

  const { start, end, dateStr } = toDateRange(date);

  // Run independent queries in parallel
  const [
    tasksResult,
    teamTasksResult,
    tracesResult,
    usageResult,
    deploymentsResult,
    decisionsResult,
    projectsResult,
    conversationsResult,
  ] = await Promise.all([
    // 1. Tasks created/updated today
    supabase
      .from('tasks')
      .select('id, title, status, priority, project_id, affected_files, decision_id, created_at')
      .gte('created_at', start)
      .lt('created_at', end),

    // 2. Team tasks updated today
    supabase
      .from('team_tasks')
      .select('id, subject, owner, status, result, team_id, updated_at')
      .gte('updated_at', start)
      .lt('updated_at', end),

    // 3. Execution traces started today
    supabase
      .from('execution_traces')
      .select('trace_id, project_id, stage, status, started_at, completed_at, summary')
      .gte('started_at', start)
      .lt('started_at', end),

    // 4. LLM usage for the day
    supabase
      .from('llm_usage')
      .select('trace_id, project_id, agent_name, total_tokens, cost_usd')
      .gte('used_at', start)
      .lt('used_at', end),

    // 5. Deployments created today
    supabase
      .from('deployments')
      .select('id, project_id, pr_number, pr_url, state, deployment_url, created_at')
      .gte('created_at', start)
      .lt('created_at', end),

    // 6. Decisions made today
    supabase
      .from('decisions')
      .select('id, signal_id, decision_rationale, result_action, created_at')
      .gte('created_at', start)
      .lt('created_at', end),

    // 7. All active/recent projects (for name lookup and progress)
    supabase
      .from('projects')
      .select('id, name, status')
      .not('status', 'eq', 'archived'),

    // 8. Conversations created today
    supabase
      .from('conversations')
      .select('id, title, execution_mode, project_id, created_at')
      .gte('created_at', start)
      .lt('created_at', end),
  ]);

  // Build project name lookup
  const projects = (projectsResult.data || []) as { id: string; name: string; status: string }[];
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // --- Tasks ---
  const rawTasks = (tasksResult.data || []) as {
    id: string; title: string; status: string; priority: string | null;
    project_id: string | null; affected_files: string[] | null;
    decision_id: string | null; created_at: string;
  }[];
  const tasks: TaskDeliverable[] = rawTasks.map((t) => ({
    task_id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project_id: t.project_id,
    project_name: t.project_id ? projectMap.get(t.project_id)?.name ?? null : null,
    affected_files: t.affected_files,
    decision_id: t.decision_id,
    created_at: t.created_at,
  }));

  // --- Team Tasks ---
  const rawTeamTasks = (teamTasksResult.data || []) as {
    id: string; subject: string; owner: string | null; status: string;
    result: unknown; team_id: string; updated_at: string;
  }[];
  const teamTasks: TeamTaskDeliverable[] = rawTeamTasks.map((t) => ({
    task_id: t.id,
    subject: t.subject,
    owner: t.owner,
    status: t.status,
    result: t.result,
    team_id: t.team_id,
    team_name: t.team_id, // team name resolved below if needed
    updated_at: t.updated_at,
  }));

  // --- LLM Usage aggregation ---
  const rawUsage = (usageResult.data || []) as {
    trace_id: string | null; project_id: string | null;
    agent_name: string; total_tokens: number; cost_usd: number | null;
  }[];

  // Group by trace_id
  const usageByTrace = new Map<string, { tokens: number; cost: number; agents: Set<string> }>();
  const agentAgg = new Map<string, { tokens: number; cost: number; calls: number }>();
  const projectAgg = new Map<string | '__none__', { tokens: number; cost: number }>();
  let totalTokens = 0;
  let totalCost = 0;

  for (const u of rawUsage) {
    const tokens = u.total_tokens || 0;
    const cost = u.cost_usd || 0;
    totalTokens += tokens;
    totalCost += cost;

    // By trace
    if (u.trace_id) {
      const existing = usageByTrace.get(u.trace_id) || { tokens: 0, cost: 0, agents: new Set<string>() };
      existing.tokens += tokens;
      existing.cost += cost;
      existing.agents.add(u.agent_name);
      usageByTrace.set(u.trace_id, existing);
    }

    // By agent
    const agentEntry = agentAgg.get(u.agent_name) || { tokens: 0, cost: 0, calls: 0 };
    agentEntry.tokens += tokens;
    agentEntry.cost += cost;
    agentEntry.calls += 1;
    agentAgg.set(u.agent_name, agentEntry);

    // By project
    const projKey = u.project_id || '__none__';
    const projEntry = projectAgg.get(projKey) || { tokens: 0, cost: 0 };
    projEntry.tokens += tokens;
    projEntry.cost += cost;
    projectAgg.set(projKey, projEntry);
  }

  // --- Traces with cost ---
  const rawTraces = (tracesResult.data || []) as {
    trace_id: string; project_id: string | null; stage: string;
    status: string; started_at: string; completed_at: string | null; summary: unknown;
  }[];
  const traces: TraceWithCost[] = rawTraces.map((t) => {
    const usage = usageByTrace.get(t.trace_id);
    return {
      trace_id: t.trace_id,
      project_id: t.project_id,
      project_name: t.project_id ? projectMap.get(t.project_id)?.name ?? null : null,
      stage: t.stage,
      status: t.status,
      started_at: t.started_at,
      completed_at: t.completed_at,
      summary: t.summary,
      total_tokens: usage?.tokens ?? 0,
      total_cost_usd: round4(usage?.cost ?? 0),
      agents_involved: usage ? Array.from(usage.agents) : [],
    };
  });

  // --- Deployments ---
  const rawDeployments = (deploymentsResult.data || []) as {
    id: string; project_id: string | null; pr_number: number;
    pr_url: string; state: string; deployment_url: string | null; created_at: string;
  }[];
  const deployments: DeploymentOutcome[] = rawDeployments.map((d) => ({
    deployment_id: d.id,
    project_id: d.project_id,
    project_name: d.project_id ? projectMap.get(d.project_id)?.name ?? null : null,
    pr_number: d.pr_number,
    pr_url: d.pr_url,
    state: d.state,
    deployment_url: d.deployment_url,
    created_at: d.created_at,
  }));

  // --- Decisions ---
  const rawDecisions = (decisionsResult.data || []) as {
    id: string; signal_id: string | null; decision_rationale: string;
    result_action: any; created_at: string;
  }[];
  const decisions: DecisionOutcome[] = rawDecisions.map((d) => ({
    decision_id: d.id,
    signal_id: d.signal_id,
    decision_rationale: d.decision_rationale,
    result_action: d.result_action,
    confidence: extractConfidence(d.result_action),
    created_at: d.created_at,
  }));

  // --- Cost by agent ---
  const costByAgent: CostByAgent[] = Array.from(agentAgg.entries())
    .map(([agent_name, data]) => ({
      agent_name,
      total_tokens: data.tokens,
      total_cost_usd: round4(data.cost),
      call_count: data.calls,
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  // --- Cost by project ---
  const costByProject: CostByProject[] = Array.from(projectAgg.entries())
    .map(([key, data]) => ({
      project_id: key === '__none__' ? null : key,
      project_name: key === '__none__' ? null : projectMap.get(key)?.name ?? null,
      total_tokens: data.tokens,
      total_cost_usd: round4(data.cost),
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  // --- Project progress ---
  const projectProgress: ProjectProgress[] = projects
    .filter((p) => p.status !== 'draft')
    .map((p) => {
      const pTasks = rawTasks.filter((t) => t.project_id === p.id);
      const pTraces = rawTraces.filter((t) => t.project_id === p.id);
      const pCost = projectAgg.get(p.id);
      return {
        project_id: p.id,
        name: p.name,
        status: p.status,
        total_cost_usd: round4(pCost?.cost ?? 0),
        tasks_completed: pTasks.filter((t) => t.status === 'done').length,
        tasks_total: pTasks.length,
        traces_completed: pTraces.filter((t) => t.status === 'completed').length,
        traces_failed: pTraces.filter((t) => t.status === 'failed').length,
        traces_total: pTraces.length,
      };
    })
    .filter((p) => p.tasks_total > 0 || p.traces_total > 0 || p.total_cost_usd > 0);

  // --- Conversations ---
  const rawConversations = (conversationsResult.data || []) as {
    id: string; title: string | null; execution_mode: string | null;
    project_id: string | null; created_at: string;
  }[];
  const conversations: ConversationSummary[] = rawConversations.map((c) => ({
    conversation_id: c.id,
    title: c.title,
    execution_mode: c.execution_mode,
    project_id: c.project_id,
    created_at: c.created_at,
  }));

  return {
    report_date: dateStr,
    period_start: start,
    period_end: end,
    tasks,
    team_tasks: teamTasks,
    traces,
    deployments,
    decisions,
    cost_by_agent: costByAgent,
    cost_by_project: costByProject,
    total_cost_usd: round4(totalCost),
    total_tokens: totalTokens,
    project_progress: projectProgress,
    conversations,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractConfidence(resultAction: unknown): number | null {
  if (!resultAction || typeof resultAction !== 'object') return null;
  const ra = resultAction as Record<string, unknown>;
  if (typeof ra.confidence === 'number') return ra.confidence;
  if (typeof ra.confidence_level === 'number') return ra.confidence_level;
  return null;
}

function emptyReport(dateStr: string, start: string, end: string): DailyReportData {
  return {
    report_date: dateStr,
    period_start: start,
    period_end: end,
    tasks: [],
    team_tasks: [],
    traces: [],
    deployments: [],
    decisions: [],
    cost_by_agent: [],
    cost_by_project: [],
    total_cost_usd: 0,
    total_tokens: 0,
    project_progress: [],
    conversations: [],
  };
}
