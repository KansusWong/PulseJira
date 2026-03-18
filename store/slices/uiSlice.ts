import type { StateCreator } from 'zustand';

export interface UISlice {
  // ── Sidebar state machine ──
  sidebarState: 'expanded' | 'collapsed';       // user's explicit preference
  sidebarAutoCollapsed: boolean;                 // true when artifacts panel caused collapse

  // Computed / backward-compat (read-only semantics, but stored for selector stability)
  sidebarOpen: boolean;                          // === !isSidebarCollapsed — legacy compat
  isSidebarCollapsed: boolean;                   // true when collapsed by user OR auto-collapsed

  // ── Right panel (SSE panels) ──
  // NOTE: rightPanelOpen / toggleRightPanel / setRightPanelOpen are kept for backward
  // compatibility but are effectively dead code — layout.tsx computes rightPanelOpen
  // inline from SSE panel visibility flags. Will be cleaned up in a later task.
  rightPanelOpen: boolean;

  // ── View mode ──
  viewMode: 'inbox' | 'project' | 'kanban' | 'new';

  // ── Actions ──
  toggleSidebar: () => void;
  autoCollapseSidebar: () => void;
  autoExpandSidebar: () => void;
  toggleRightPanel: () => void;
  setViewMode: (mode: UISlice['viewMode']) => void;
  setSidebarOpen: (open: boolean) => void;        // legacy compat
  setRightPanelOpen: (open: boolean) => void;
}

/** Helper: derive computed sidebar values from raw state */
function sidebarComputed(sidebarState: 'expanded' | 'collapsed', sidebarAutoCollapsed: boolean) {
  const isSidebarCollapsed = sidebarState === 'collapsed' || sidebarAutoCollapsed;
  return {
    isSidebarCollapsed,
    sidebarOpen: !isSidebarCollapsed,   // backward compat
  };
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  // ── Sidebar initial state ──
  sidebarState: 'expanded',
  sidebarAutoCollapsed: false,
  ...sidebarComputed('expanded', false),

  // ── Right panel ──
  rightPanelOpen: true,

  // ── View mode ──
  viewMode: 'inbox',

  // ── Actions ──

  toggleSidebar: () =>
    set((state) => {
      const next: 'expanded' | 'collapsed' =
        state.sidebarState === 'expanded' ? 'collapsed' : 'expanded';
      return {
        sidebarState: next,
        sidebarAutoCollapsed: false,        // explicit toggle clears auto-collapse
        ...sidebarComputed(next, false),
      };
    }),

  autoCollapseSidebar: () =>
    set((state) => {
      // Only auto-collapse if sidebar is currently expanded and not already auto-collapsed
      if (state.sidebarState === 'expanded' && !state.sidebarAutoCollapsed) {
        return {
          sidebarAutoCollapsed: true,
          ...sidebarComputed(state.sidebarState, true),
        };
      }
      return {};
    }),

  autoExpandSidebar: () =>
    set((state) => {
      // Only restore if sidebar was auto-collapsed (not manually collapsed)
      if (state.sidebarAutoCollapsed) {
        return {
          sidebarAutoCollapsed: false,
          ...sidebarComputed(state.sidebarState, false),
        };
      }
      return {};
    }),

  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSidebarOpen: (open) => {
    // Legacy compat: translate boolean to state machine
    const sidebarState: 'expanded' | 'collapsed' = open ? 'expanded' : 'collapsed';
    set({
      sidebarState,
      sidebarAutoCollapsed: false,
      ...sidebarComputed(sidebarState, false),
    });
  },

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
});
