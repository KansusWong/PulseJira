import { supabase } from '@/connectors/external/supabase';
import type { Project, CreateProjectInput, ProjectTask } from './types';

/**
 * Project CRUD operations backed by Supabase.
 * All functions throw on DB errors — callers (API routes) catch and return 500.
 */

export async function listProjects(): Promise<Project[]> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error) return data || [];
      if (attempt === MAX_RETRIES) throw new Error(`Failed to list projects: ${error.message}`);
    } catch (e: any) {
      if (attempt === MAX_RETRIES) throw e;
    }
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
  return [];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (!error) return data;
      if (error.code === 'PGRST116') return null; // Not found
      if (attempt === MAX_RETRIES) throw new Error(`Failed to get project: ${error.message}`);
    } catch (e: any) {
      if (attempt === MAX_RETRIES) throw e;
    }
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
  return null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: input.name,
      description: input.description,
      status: 'draft',
      ...(input.is_light != null && { is_light: input.is_light }),
      ...(input.conversation_id && { conversation_id: input.conversation_id }),
      ...(input.execution_mode && { execution_mode: input.execution_mode }),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }
  return data;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'prepare_result' | 'plan_result' | 'signal_id' | 'agent_logs' | 'pipeline_checkpoint' | 'execution_mode'>>
): Promise<Project> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .select()
        .single();

      if (!error) return data;
      if (attempt === MAX_RETRIES) throw new Error(`Failed to update project: ${error.message}`);
      console.error(`[ProjectService] updateProject attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
    } catch (e: any) {
      if (attempt === MAX_RETRIES) throw new Error(`Failed to update project: ${e.message}`);
      console.error(`[ProjectService] updateProject attempt ${attempt}/${MAX_RETRIES} network error:`, e.message);
    }
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
  throw new Error('Failed to update project: exhausted retries');
}

export async function deleteProject(projectId: string): Promise<void> {
  // Detach conversations that reference this project (no ON DELETE CASCADE in schema)
  await supabase
    .from('conversations')
    .update({ project_id: null })
    .eq('project_id', projectId);

  // Detach messages linked to this project
  await supabase
    .from('messages')
    .update({ project_id: null })
    .eq('project_id', projectId);

  // Delete agent_teams linked to this project (no ON DELETE CASCADE in schema;
  // cascade will remove agent_mailbox and team_tasks via their own FK constraints)
  await supabase
    .from('agent_teams')
    .delete()
    .eq('project_id', projectId);

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}

// --- Project Tasks ---

// DB constraint uses 'in_progress'; frontend uses 'in-progress' / 'todo'.
const DB_STATUS_TO_FRONTEND: Record<string, string> = {
  inbox: 'todo',
  triage: 'todo',
  backlog: 'todo',
  in_progress: 'in-progress',
  done: 'done',
  rejected: 'todo',
};

const FRONTEND_STATUS_TO_DB: Record<string, string> = {
  todo: 'backlog',
  'in-progress': 'in_progress',
  done: 'done',
};

export async function getProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get project tasks: ${error.message}`);
  }
  const oldTasks = (data || []).map((t) => ({
    ...t,
    status: DB_STATUS_TO_FRONTEND[t.status] || t.status,
  }));

  // Also fetch team_tasks for projects created via team execution pipeline
  const teamTasks = await getTeamTasksForProject(projectId);
  if (teamTasks.length === 0) return oldTasks;
  if (oldTasks.length === 0) return teamTasks;

  // Merge, dedup by title (team_tasks take precedence)
  const teamTitles = new Set(teamTasks.map((t) => t.title));
  return [...teamTasks, ...oldTasks.filter((t) => !teamTitles.has(t.title))];
}

const TEAM_STATUS_TO_FRONTEND: Record<string, string> = {
  pending: 'todo',
  in_progress: 'in-progress',
  completed: 'done',
};

async function getTeamTasksForProject(projectId: string): Promise<ProjectTask[]> {
  const { data: teams } = await supabase
    .from('agent_teams')
    .select('id')
    .eq('project_id', projectId);

  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((t: any) => t.id);
  const { data: teamTasks, error } = await supabase
    .from('team_tasks')
    .select('*')
    .in('team_id', teamIds)
    .neq('status', 'deleted')
    .order('created_at', { ascending: true });

  if (error || !teamTasks) return [];

  return teamTasks.map((tt: any) => ({
    id: tt.id,
    project_id: projectId,
    title: tt.subject,
    description: tt.description || undefined,
    status: TEAM_STATUS_TO_FRONTEND[tt.status] || tt.status,
    type: 'chore',
    priority: 'medium',
    created_at: tt.created_at,
  }));
}

export async function createProjectTask(
  projectId: string,
  task: Omit<ProjectTask, 'id' | 'project_id' | 'created_at'>
): Promise<ProjectTask> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...task,
      project_id: projectId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create task: ${error.message}`);
  }
  return data;
}

export async function updateProjectTask(
  taskId: string,
  updates: Partial<Pick<ProjectTask, 'title' | 'description' | 'status' | 'priority'>>
): Promise<ProjectTask> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update task: ${error.message}`);
  }
  return data;
}

export async function deleteProjectTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    throw new Error(`Failed to delete task: ${error.message}`);
  }
}

/**
 * Upsert a task's status by matching (project_id, title).
 * Used by the implement pipeline to persist task progress to the DB.
 */
export async function syncTaskStatus(
  projectId: string,
  title: string,
  status: 'todo' | 'in-progress' | 'done',
  extra?: { description?: string; type?: string; priority?: string }
): Promise<void> {
  const dbStatus = FRONTEND_STATUS_TO_DB[status] || status;

  const { data: existing, error: findErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('title', title)
    .maybeSingle();

  if (findErr) {
    throw new Error(`Failed to find task for sync: ${findErr.message}`);
  }

  if (existing) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: dbStatus })
      .eq('id', existing.id);
    if (error) {
      throw new Error(`Failed to update task status: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from('tasks')
      .insert({
        title,
        project_id: projectId,
        status: dbStatus,
        type: extra?.type || 'chore',
        priority: extra?.priority || 'medium',
        description: extra?.description,
      });
    if (error) {
      throw new Error(`Failed to insert task: ${error.message}`);
    }
  }
}

/**
 * Remove all tasks for a project. Called before a fresh implementation run
 * so stale tasks don't linger.
 */
export async function clearProjectTasks(projectId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('project_id', projectId);
  if (error) {
    throw new Error(`Failed to clear project tasks: ${error.message}`);
  }
}
