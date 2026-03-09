import { supabase } from '@/connectors/external/supabase';
import type { Project, CreateProjectInput, ProjectTask } from './types';

/**
 * Project CRUD operations backed by Supabase.
 * All functions throw on DB errors — callers (API routes) catch and return 500.
 */

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return data || [];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get project: ${error.message}`);
  }
  return data;
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
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'prepare_result' | 'plan_result' | 'signal_id'>>
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update project: ${error.message}`);
  }
  return data;
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
  return (data || []).map((t) => ({
    ...t,
    status: DB_STATUS_TO_FRONTEND[t.status] || t.status,
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
