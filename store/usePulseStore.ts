import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  tag: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  affected_files?: string[];
}

interface AnalyzedTask {
  title: string;
  description: string;
  type: 'feature' | 'bug' | 'chore';
  priority: 'high' | 'medium' | 'low';
  affected_files: string[];
}

interface AnalysisResult {
  score: number;
  decision: 'GO' | 'NO_GO';
  rationale: string;
  featureName: string;
  tasks?: AnalyzedTask[]; // Structured tasks from Planner Agent
}

export interface PrepareResult {
  decision: "PROCEED" | "CIRCUIT_BREAK";
  summary: string;
  blue_case: {
    proposal: string;
    vision_alignment_score: number;
  };
  red_case: {
    critique: string;
    risks: string[];
  };
  arbitrator_rationale: string;
  competitor_analysis?: string;
  logs?: string[];
  signalId?: string;
}

interface PulseState {
  // Signals Panel
  signals: string[];
  addSignal: (msg: string) => void;
  clearSignals: () => void;
  
  // Context
  context: {
    description: string;
    url?: string;
    urls?: string[];
  };
  setContext: (ctx: { description: string; url?: string; urls?: string[] }) => void;

  // CPO Brain
  isAnalyzing: boolean;
  prepareResult: PrepareResult | null;
  analysisResult: AnalysisResult | null;
  setAnalyzing: (isAnalyzing: boolean) => void;
  setPrepareResult: (result: PrepareResult | null) => void;
  setAnalysisResult: (result: AnalysisResult | null) => void;
  
  // Kanban
  tasks: Task[];
  deployToKanban: () => void;
  updateTaskStatus: (id: string, status: Task['status']) => void;
  clearTasks: () => void;
}

export const usePulseStore = create<PulseState>()(
  persist(
    (set, get) => ({
      signals: [],
      addSignal: (msg) => set((state) => ({ signals: [...state.signals, msg] })),
      clearSignals: () => set({ signals: [] }),

      context: { description: "", url: "", urls: [] },
      setContext: (ctx) => set({ context: ctx }),

      isAnalyzing: false,
      prepareResult: null,
      analysisResult: null,
      setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      setPrepareResult: (result) => set({ prepareResult: result }),
      setAnalysisResult: (result) => set({ analysisResult: result }),

      tasks: [],
      deployToKanban: () => {
        const { analysisResult } = get();
        if (!analysisResult || !analysisResult.tasks) return;

        const newTasks: Task[] = analysisResult.tasks.map((t, i) => ({
          id: `task-${Date.now()}-${i}`,
          title: t.title,
          status: 'todo',
          tag: t.type === 'feature' ? 'Feature' : (t.type === 'bug' ? 'Bug' : 'Chore'), // Map Agent type to Tag
          description: t.description,
          priority: t.priority,
          affected_files: t.affected_files
        }));

        set((state) => ({ tasks: [...state.tasks, ...newTasks] }));
      },
      updateTaskStatus: (id, status) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        })),
      clearTasks: () => set({ tasks: [] }),
    }),
    {
      name: 'pulse-storage',
    }
  )
);
