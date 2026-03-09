import type { StateCreator } from 'zustand';

export interface UISlice {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  viewMode: 'inbox' | 'project' | 'kanban' | 'new';

  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setViewMode: (mode: UISlice['viewMode']) => void;
  setSidebarOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  sidebarOpen: true,
  rightPanelOpen: true,
  viewMode: 'inbox',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
});
