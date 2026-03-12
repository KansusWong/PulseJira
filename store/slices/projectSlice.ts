import type { StateCreator } from 'zustand';
import type { Project } from '@/projects/types';

export interface ProjectSlice {
  projects: Project[];
  activeProjectId: string | null;
  activeDeliverableId: string | null;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  setActiveProject: (id: string | null) => void;
  setActiveDeliverable: (id: string | null) => void;
  updateProjectInStore: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
}

export const createProjectSlice: StateCreator<ProjectSlice> = (set) => ({
  projects: [],
  activeProjectId: null,
  activeDeliverableId: null,

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id);
      if (exists) {
        // Merge into existing project instead of duplicating
        return {
          projects: state.projects.map((p) =>
            p.id === project.id ? { ...p, ...project } : p
          ),
        };
      }
      return { projects: [project, ...state.projects] };
    }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  setActiveDeliverable: (id) => set({ activeDeliverableId: id }),

  updateProjectInStore: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    })),
});
