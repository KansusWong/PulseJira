import type { StateCreator } from 'zustand';

export interface KanbanTask {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  tag: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  affected_files?: string[];
  projectId?: string;
}

export interface KanbanSlice {
  tasks: KanbanTask[];
  setTasks: (tasks: KanbanTask[]) => void;
  addTasks: (tasks: KanbanTask[]) => void;
  updateTaskStatus: (id: string, status: KanbanTask['status']) => void;
  clearTasks: () => void;
  deployToKanban: (analysisResult: any, projectId?: string) => void;
  getProjectTaskProgress: (projectId: string) => { todo: number; inProgress: number; done: number; total: number };
}

export const createKanbanSlice: StateCreator<KanbanSlice> = (set, get) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  addTasks: (tasks) =>
    set((state) => ({ tasks: [...state.tasks, ...tasks] })),

  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  clearTasks: () => set({ tasks: [] }),

  deployToKanban: (analysisResult, projectId) => {
    if (!analysisResult?.tasks) return;
    const newTasks: KanbanTask[] = analysisResult.tasks.map((t: any, i: number) => ({
      id: `task-${Date.now()}-${i}`,
      title: t.title,
      status: 'todo' as const,
      tag: t.type === 'feature' ? 'Feature' : t.type === 'bug' ? 'Bug' : 'Chore',
      description: t.description,
      priority: t.priority,
      affected_files: t.affected_files,
      projectId,
    }));
    set((state) => ({
      tasks: [
        ...state.tasks.filter((t) => t.projectId !== projectId),
        ...newTasks,
      ],
    }));
  },

  getProjectTaskProgress: (projectId) => {
    const projectTasks = get().tasks.filter((t) => t.projectId === projectId);
    return {
      todo: projectTasks.filter((t) => t.status === 'todo').length,
      inProgress: projectTasks.filter((t) => t.status === 'in-progress').length,
      done: projectTasks.filter((t) => t.status === 'done').length,
      total: projectTasks.length,
    };
  },
});
