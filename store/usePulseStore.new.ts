import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createProjectSlice, type ProjectSlice } from './slices/projectSlice';
import { createAgentSlice, type AgentSlice } from './slices/agentSlice';
import { createKanbanSlice, type KanbanSlice } from './slices/kanbanSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createChatSlice, type ChatSlice } from './slices/chatSlice';
import { createI18nSlice, type I18nSlice } from './slices/i18nSlice';

// Legacy types for backward compatibility
export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  tag: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  affected_files?: string[];
}

export interface MRDMarketOverview {
  market_size: string;
  growth_trend: string;
  key_drivers: string[];
}

export interface MRDPersona {
  name: string;
  description: string;
  pain_points: string[];
  current_alternatives: string;
}

export interface MRDCompetitiveLandscape {
  key_players: string[];
  our_differentiation: string;
  competitive_advantage: string;
}

export interface MRDROIProjection {
  investment_estimate: string;
  expected_return: string;
  payback_period: string;
  confidence_level: 'high' | 'medium' | 'low';
}

export interface MRDDocument {
  executive_pitch: string;
  market_overview: MRDMarketOverview;
  target_personas: MRDPersona[];
  competitive_landscape: MRDCompetitiveLandscape;
  roi_projection: MRDROIProjection;
  market_timing: string;
  success_metrics: string[];
}

export interface ROIChallenges {
  investment_reality_check: string;
  return_skepticism: string;
  hidden_costs: string[];
}

export interface PrepareResult {
  decision: "PROCEED" | "CIRCUIT_BREAK";
  summary: string;
  blue_case: {
    proposal: string;
    vision_alignment_score: number;
    market_opportunity_score: number;
    mrd: MRDDocument;
  };
  red_case: {
    critique: string;
    risks: string[];
    roi_challenges?: ROIChallenges;
    opportunity_cost?: string;
    market_risks?: string[];
  };
  arbitrator_rationale: string;
  business_verdict?: string;
  competitor_analysis?: string;
  logs?: string[];
  signalId?: string;
}

// Legacy state interface (backward compat for old page.tsx during migration)
interface LegacySlice {
  signals: string[];
  addSignal: (msg: string) => void;
  clearSignals: () => void;

  context: { description: string; url?: string; urls?: string[] };
  setContext: (ctx: { description: string; url?: string; urls?: string[] }) => void;

  isAnalyzing: boolean;
  prepareResult: PrepareResult | null;
  analysisResult: any;
  setAnalyzing: (isAnalyzing: boolean) => void;
  setPrepareResult: (result: PrepareResult | null) => void;
  setAnalysisResult: (result: any) => void;
}

type PulseStore = ProjectSlice & AgentSlice & KanbanSlice & UISlice & ChatSlice & I18nSlice & LegacySlice;

export const usePulseStore = create<PulseStore>()(
  persist(
    (set, get, api) => ({
      // Slice stores
      ...createProjectSlice(set, get, api),
      ...createAgentSlice(set, get, api),
      ...createKanbanSlice(set, get, api),
      ...createUISlice(set, get, api),
      ...createChatSlice(set, get, api),
      ...createI18nSlice(set, get, api),

      // Legacy state (backward compat)
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
    }),
    {
      name: 'pulse-storage',
      partialize: (state) => ({
        // Persist only essential state
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        tasks: state.tasks,
        context: state.context,
        prepareResult: state.prepareResult,
        analysisResult: state.analysisResult,
        // Chat state
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        // i18n
        locale: state.locale,
      }),
    }
  )
);
