import { supabase } from '../db/client';

export async function rejectTask(taskId: string, reason: string) {
  // 1. Update task status
  const { error: taskError } = await supabase
    .from('tasks')
    .update({ status: 'rejected' })
    .eq('id', taskId);
  
  if (taskError) throw taskError;

  // 2. Log rejection reason
  const { error: logError } = await supabase
    .from('rejection_logs')
    .insert({ task_id: taskId, reason });

  if (logError) throw logError;

  // 3. (Optional) Update the parent decision's embedding or metadata to reflect this failure?
  // For now, we will retrieve rejection logs in the planner prompt as "Negative Examples"
}

export async function getRecentRejections(limit: number = 5) {
  const { data, error } = await supabase
    .from('rejection_logs')
    .select('reason, tasks(title, description)')
    .order('rejected_at', { ascending: false })
    .limit(limit);
  
  if (error) return [];
  
  return data.map((log: any) => `Rejected Task: "${log.tasks?.title || 'Unknown Task'}" - Reason: ${log.reason}`).join('\n');
}
