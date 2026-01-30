import { supabase } from './supabase';

export type TaskNode = {
  id: string;
  status: string;
  dependencies: string[];
};

export async function getTaskGraph() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, status, dependencies');

  if (error || !tasks) return [];

  return tasks;
}

export function calculateTaskStatus(task: TaskNode, allTasks: Map<string, TaskNode>): 'blocked' | 'ready' {
  if (task.status === 'done' || task.status === 'rejected') return 'ready'; 

  if (!task.dependencies || task.dependencies.length === 0) return 'ready';

  for (const depId of task.dependencies) {
    const depTask = allTasks.get(depId);
    if (!depTask) continue; 
    if (depTask.status !== 'done') {
      return 'blocked';
    }
  }
  return 'ready';
}

export async function getKanbanData() {
  const tasks = await getTaskGraph();
  if (!tasks) return [];

  const taskMap = new Map(tasks.map((t: any) => [t.id, t]));

  return tasks.map((t: any) => ({
    ...t,
    isBlocked: calculateTaskStatus(t, taskMap) === 'blocked'
  }));
}
