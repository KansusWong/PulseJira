import type { StateCreator } from 'zustand';

export interface AgentLogEntry {
  id: string;
  agent: string;
  type: 'start' | 'log' | 'tool' | 'complete';
  message: string;
  timestamp: number;
  taskId?: string;
  taskTitle?: string;
}

export interface AgentSlice {
  agentLogs: AgentLogEntry[];
  activeAgents: Set<string>;
  currentStage: 'idle' | 'prepare' | 'plan' | 'implement' | 'deploy';
  currentStep: number;
  totalSteps: number;
  isRunning: boolean;
  /** Which project the current agent run belongs to (null = none). */
  runningProjectId: string | null;

  addAgentLog: (entry: Omit<AgentLogEntry, 'id' | 'timestamp'>) => void;
  clearAgentLogs: () => void;
  setActiveAgent: (agent: string, active: boolean) => void;
  setStage: (stage: 'idle' | 'prepare' | 'plan' | 'implement' | 'deploy') => void;
  setProgress: (step: number, total: number) => void;
  setRunning: (running: boolean, projectId?: string) => void;
  resetAgentState: () => void;
}

let logCounter = 0;

export const createAgentSlice: StateCreator<AgentSlice> = (set) => ({
  agentLogs: [],
  activeAgents: new Set(),
  currentStage: 'idle',
  currentStep: 0,
  totalSteps: 0,
  isRunning: false,
  runningProjectId: null,

  addAgentLog: (entry) =>
    set((state) => ({
      agentLogs: [
        ...state.agentLogs,
        {
          ...entry,
          id: `log-${++logCounter}`,
          timestamp: Date.now(),
        },
      ],
    })),

  clearAgentLogs: () => set({ agentLogs: [] }),

  setActiveAgent: (agent, active) =>
    set((state) => {
      const next = new Set(state.activeAgents);
      if (active) next.add(agent);
      else next.delete(agent);
      return { activeAgents: next };
    }),

  setStage: (stage) => set({ currentStage: stage }),
  setProgress: (step, total) => set({ currentStep: step, totalSteps: total }),
  setRunning: (running, projectId) =>
    set({ isRunning: running, runningProjectId: running ? (projectId ?? null) : null }),

  resetAgentState: () =>
    set({
      agentLogs: [],
      activeAgents: new Set(),
      currentStage: 'idle',
      currentStep: 0,
      totalSteps: 0,
      isRunning: false,
      runningProjectId: null,
    }),
});
