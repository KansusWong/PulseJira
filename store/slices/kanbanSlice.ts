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
  updateTaskStatus: (id: string, status: KanbanTask['status']) => void;
  clearTasks: () => void;
  deployToKanban: (analysisResult: any, projectId?: string) => void;
}

export const createKanbanSlice: StateCreator<KanbanSlice> = (set) => ({
  tasks: [],

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
});
