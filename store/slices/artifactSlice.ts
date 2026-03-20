import type { StateCreator } from 'zustand';
import type { UISlice } from './uiSlice';

// ── Types ──

export interface ArtifactRef {
  id: string;
  type: 'code' | 'json' | 'pptx' | 'image' | 'markdown' | 'pdf' | 'csv' | 'excel' | 'html' | 'svg';
  filename: string;
  filePath?: string;
  content?: string;
  url?: string;
}

export interface ArtifactSlice {
  artifactPanelOpen: boolean;
  openArtifacts: ArtifactRef[];
  activeArtifactId: string | null;

  openArtifact: (ref: ArtifactRef) => void;
  closeArtifact: (id: string) => void;
  setActiveArtifact: (id: string) => void;
  closeAllArtifacts: () => void;
}

// ── Slice creator ──
// Uses UISlice in the full-store generic so `get()` can reach autoCollapse/autoExpand.

export const createArtifactSlice: StateCreator<
  ArtifactSlice & UISlice,  // full store shape (at least what we need)
  [],
  [],
  ArtifactSlice              // this slice's contribution
> = (set, get) => ({
  artifactPanelOpen: false,
  openArtifacts: [],
  activeArtifactId: null,

  openArtifact: (ref) => {
    const { openArtifacts } = get();
    const existing = openArtifacts.find((a) => a.filePath && a.filePath === ref.filePath);

    if (existing) {
      // Same file already open — update content in place and focus tab
      set({
        openArtifacts: openArtifacts.map((a) =>
          a.filePath === ref.filePath
            ? { ...a, content: ref.content, url: ref.url }
            : a
        ),
        activeArtifactId: existing.id,
        artifactPanelOpen: true,
      });
    } else {
      // New artifact — add tab, focus, open panel
      set({
        openArtifacts: [...openArtifacts, ref],
        activeArtifactId: ref.id,
        artifactPanelOpen: true,
      });
    }

    // Auto-collapse sidebar when artifact panel opens
    get().autoCollapseSidebar();
  },

  closeArtifact: (id) => {
    const { openArtifacts, activeArtifactId } = get();
    const remaining = openArtifacts.filter((a) => a.id !== id);

    // If we closed the active artifact, pick the last one in the list (or null)
    let nextActive = activeArtifactId;
    if (activeArtifactId === id) {
      nextActive = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    }

    const panelOpen = remaining.length > 0;
    set({
      openArtifacts: remaining,
      activeArtifactId: nextActive,
      artifactPanelOpen: panelOpen,
    });

    // If panel closed (no more artifacts), restore sidebar
    if (!panelOpen) {
      get().autoExpandSidebar();
    }
  },

  setActiveArtifact: (id) => {
    set({ activeArtifactId: id });
  },

  closeAllArtifacts: () => {
    set({
      openArtifacts: [],
      activeArtifactId: null,
      artifactPanelOpen: false,
    });

    // Restore sidebar
    get().autoExpandSidebar();
  },
});
