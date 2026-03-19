import type { StateCreator } from 'zustand';
import type {
  Conversation,
  ChatMessage,
  ComplexityAssessment,
  DecisionOutput,
  AgentStatus,
  AgentMailMessage,
  TeamStatus,
  StructuredRequirements,
  StructuredAgentStep,
  CodeSolutionProposal,
  QuestionnaireData,
} from '@/lib/core/types';

export type PlanStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

/** A section in the inline streaming bubble (text or tool call). */
export type StreamingSection =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolLabel: string; toolCallId: string;
      args: string; status: 'running' | 'success' | 'error'; resultPreview?: string };

/** Snapshot of all right-side panel states — used for per-conversation caching. */
export interface PanelSnapshot {
  planPanel: ChatSlice['planPanel'];
  clarificationPanel: ChatSlice['clarificationPanel'];
  dmPanel: ChatSlice['dmPanel'];
  toolApprovalPanel: ChatSlice['toolApprovalPanel'];
  architectPanel: ChatSlice['architectPanel'];
  teamPanel: ChatSlice['teamPanel'];
  solutionPanel: ChatSlice['solutionPanel'];
  teamCollaboration: ChatSlice['teamCollaboration'];
  streamingSteps: ChatSlice['streamingSteps'];
}

/** Max number of per-conversation panel snapshots kept in memory. */
const PANEL_CACHE_MAX = 10;

export interface ChatSlice {
  // Conversation state
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId → messages
  isStreaming: boolean;

  // Per-conversation panel state cache (LRU, max PANEL_CACHE_MAX entries)
  panelStateCache: Record<string, PanelSnapshot>;
  panelCacheOrder: string[]; // oldest → newest

  // Plan panel state
  planPanel: {
    visible: boolean;
    assessment: ComplexityAssessment | null;
    status: 'pending' | 'approved' | 'rejected' | 'idle';
    stepStates: { status: PlanStepStatus; summary?: string }[];
  };

  // Clarification panel state (L3 requirements confirmation)
  clarificationPanel: {
    visible: boolean;
    requirements: StructuredRequirements | null;
  };

  // DM decision panel state (L3 DM checkpoint approval)
  dmPanel: {
    visible: boolean;
    decision: DecisionOutput | null;
    status: 'pending' | 'approved' | 'rejected' | 'idle';
  };

  // Tool approval panel state (L3 dangerous tool gating)
  toolApprovalPanel: {
    visible: boolean;
    approvalId: string | null;
    toolName: string | null;
    toolArgs: Record<string, any> | null;
    agentName: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'idle';
  };

  // Architect resume panel state (checkpoint recovery)
  architectPanel: {
    visible: boolean;
    status: 'idle' | 'failed';
    stepsCompleted: number;
    errorMessage: string | null;
    attempt: number;
  };

  // Team panel state
  teamPanel: {
    visible: boolean;
    teamId: string | null;
    agents: AgentStatus[];
    communications: AgentMailMessage[];
  };

  // Solution proposal panel state (code solution selection)
  solutionPanel: {
    visible: boolean;
    proposal: CodeSolutionProposal | null;
    selectedSolutionId: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'idle';
  };

  // Streaming steps (shared by StreamingStepIndicator and TeamCollaborationView)
  streamingSteps: StructuredAgentStep[];

  // Team collaboration view state (main area inline view)
  teamCollaboration: {
    active: boolean;
    collapsed: boolean;
  };

  // Per-mate chat messages and streaming tokens
  mateChatMessages: Record<string, Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>;
  mateStreamingTokens: Record<string, string>;
  agentLanePage: number;

  // Compaction → Team upgrade panel state (transient, not persisted)
  compactionUpgradePanel: {
    visible: boolean;
    upgradeId: string | null;
    tokenUsage: { estimated: number; max: number; ratio: number } | null;
    timeoutAt: number | null;
  };

  // Project upgrade panel state (Chat → Project conversion prompt, transient)
  projectUpgradePanel: {
    visible: boolean;
    conversationId: string | null;
  };

  // Pending team upgrade data for auto-bridge (transient)
  pendingTeamUpgrade: {
    stateSummary: string;
    conversationId: string;
  } | null;

  // Streaming sections (inline bubble — tokens + tool calls interleaved)
  streamingSections: StreamingSection[];

  // Context window usage indicator
  contextUsage: { estimated: number; max: number; ratio: number } | null;

  // Questionnaire inline state
  questionnaireData: QuestionnaireData | null;

  // Thinking mode toggle (user-facing model selector)
  thinkingMode: boolean;
  /** Selected fast model ID (e.g. 'glm-4-flash', 'claude-sonnet-4-5-20250929'). Empty = env default. */
  selectedFastModel: string;

  // Studio panel state (global, not per-conversation)
  studioPanel: {
    visible: boolean;
    tabs: Array<{ skillId: string; displayName: string }>;
    activeTabId: string | null;
  };

  // Org context
  currentOrgId: string | null;
  currentOrgName: string | null;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  setActiveConversationId: (id: string | null) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  toggleHighlight: (conversationId: string) => void;

  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;

  showPlanPanel: (assessment: ComplexityAssessment) => void;
  hidePlanPanel: () => void;
  approvePlan: () => void;
  rejectPlan: () => void;
  updatePlanStepProgress: (stepIndex: number, status: PlanStepStatus, summary?: string) => void;

  showClarificationForm: (requirements: StructuredRequirements) => void;
  hideClarificationForm: () => void;

  showDmPanel: (decision: DecisionOutput) => void;
  hideDmPanel: () => void;
  approveDm: () => void;
  rejectDm: () => void;

  showToolApproval: (data: { approvalId: string; toolName: string; toolArgs: Record<string, any>; agentName: string }) => void;
  hideToolApproval: () => void;
  approveToolExecution: () => void;
  rejectToolExecution: () => void;

  showArchitectFailed: (data: { errorMessage: string; stepsCompleted: number; attempt: number }) => void;
  hideArchitectPanel: () => void;

  showTeamPanel: (teamId: string, agents: AgentStatus[]) => void;
  hideTeamPanel: () => void;
  updateTeamStatus: (status: TeamStatus) => void;
  addTeamCommunication: (message: AgentMailMessage) => void;

  showSolutionPanel: (proposal: CodeSolutionProposal) => void;
  hideSolutionPanel: () => void;
  selectSolution: (solutionId: string) => void;
  approveSolution: () => void;
  rejectSolution: () => void;

  addStreamingStep: (step: StructuredAgentStep) => void;
  completeStreamingStep: (stepNumber: number, patch: { model?: string; durationMs?: number }) => void;
  clearStreamingSteps: () => void;
  setTeamCollaborationActive: (active: boolean) => void;
  setTeamCollaborationCollapsed: (collapsed: boolean) => void;

  addMateChatMessage: (agentName: string, role: 'user' | 'assistant', content: string) => void;
  appendMateStreamingToken: (agentName: string, token: string) => void;
  clearMateStreamingTokens: (agentName: string) => void;
  clearAllMateState: () => void;
  setAgentLanePage: (page: number) => void;

  showCompactionUpgrade: (data: { upgradeId: string; tokenUsage: { estimated: number; max: number; ratio: number } }) => void;
  hideCompactionUpgrade: () => void;
  showProjectUpgrade: (conversationId: string) => void;
  hideProjectUpgrade: () => void;
  setPendingTeamUpgrade: (data: { stateSummary: string; conversationId: string }) => void;
  clearPendingTeamUpgrade: () => void;

  appendStreamingToken: (token: string) => void;
  startStreamingToolCall: (data: { toolName: string; toolLabel: string; toolCallId: string; args: string }) => void;
  endStreamingToolCall: (data: { toolCallId: string; resultPreview?: string; success: boolean }) => void;
  resetStreamingState: () => void;

  setContextUsage: (usage: { estimated: number; max: number; ratio: number } | null) => void;

  setQuestionnaireData: (data: QuestionnaireData) => void;
  clearQuestionnaireData: () => void;

  setThinkingMode: (enabled: boolean) => void;
  setSelectedFastModel: (modelId: string) => void;

  // Studio panel actions
  openStudioTab: (skillId: string, displayName: string) => void;
  closeStudioTab: (skillId: string) => void;
  setActiveStudioTab: (skillId: string) => void;
  hideStudioPanel: () => void;
  renameStudioTab: (skillId: string, newName: string) => void;

  setCurrentOrg: (orgId: string, orgName: string) => void;

  /** Reset all right-side panels to their idle/hidden state. */
  resetAllPanels: () => void;
}

const DEFAULT_PANELS: PanelSnapshot = {
  planPanel: { visible: false, assessment: null, status: 'idle', stepStates: [] },
  clarificationPanel: { visible: false, requirements: null },
  dmPanel: { visible: false, decision: null, status: 'idle' },
  toolApprovalPanel: { visible: false, approvalId: null, toolName: null, toolArgs: null, agentName: null, status: 'idle' },
  architectPanel: { visible: false, status: 'idle', stepsCompleted: 0, errorMessage: null, attempt: 0 },
  teamPanel: { visible: false, teamId: null, agents: [], communications: [] },
  solutionPanel: { visible: false, proposal: null, selectedSolutionId: null, status: 'idle' },
  teamCollaboration: { active: false, collapsed: false },
  streamingSteps: [],
};

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isStreaming: false,
  panelStateCache: {},
  panelCacheOrder: [],

  planPanel: {
    visible: false,
    assessment: null,
    status: 'idle',
    stepStates: [],
  },

  clarificationPanel: {
    visible: false,
    requirements: null,
  },

  dmPanel: {
    visible: false,
    decision: null,
    status: 'idle',
  },

  toolApprovalPanel: {
    visible: false,
    approvalId: null,
    toolName: null,
    toolArgs: null,
    agentName: null,
    status: 'idle',
  },

  architectPanel: {
    visible: false,
    status: 'idle',
    stepsCompleted: 0,
    errorMessage: null,
    attempt: 0,
  },

  teamPanel: {
    visible: false,
    teamId: null,
    agents: [],
    communications: [],
  },

  solutionPanel: {
    visible: false,
    proposal: null,
    selectedSolutionId: null,
    status: 'idle',
  },

  streamingSteps: [],

  teamCollaboration: {
    active: false,
    collapsed: false,
  },

  mateChatMessages: {},
  mateStreamingTokens: {},
  agentLanePage: 0,

  compactionUpgradePanel: {
    visible: false,
    upgradeId: null,
    tokenUsage: null,
    timeoutAt: null,
  },

  projectUpgradePanel: {
    visible: false,
    conversationId: null,
  },

  pendingTeamUpgrade: null,

  streamingSections: [],

  contextUsage: null,

  questionnaireData: null,

  thinkingMode: false,
  selectedFastModel: 'claude-sonnet-4-5-20250929',

  studioPanel: {
    visible: false,
    tabs: [],
    activeTabId: null,
  },

  currentOrgId: null,
  currentOrgName: null,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  setActiveConversationId: (id) => set((state) => {
    const prevId = state.activeConversationId;
    const cache = { ...state.panelStateCache };
    let order = [...state.panelCacheOrder];

    // ── Save current panel state for the outgoing conversation ──
    if (prevId) {
      const snapshot: PanelSnapshot = {
        planPanel: state.planPanel,
        clarificationPanel: state.clarificationPanel,
        dmPanel: state.dmPanel,
        toolApprovalPanel: state.toolApprovalPanel,
        architectPanel: state.architectPanel,
        teamPanel: state.teamPanel,
        solutionPanel: state.solutionPanel,
        teamCollaboration: state.teamCollaboration,
        streamingSteps: state.streamingSteps,
      };
      // Check if any panel has meaningful state worth caching
      const hasState = snapshot.planPanel.visible || snapshot.planPanel.assessment !== null
        || snapshot.clarificationPanel.visible || snapshot.clarificationPanel.requirements !== null
        || snapshot.dmPanel.visible || snapshot.dmPanel.decision !== null
        || snapshot.toolApprovalPanel.visible || snapshot.toolApprovalPanel.approvalId !== null
        || snapshot.architectPanel.visible || snapshot.architectPanel.status !== 'idle'
        || snapshot.teamPanel.visible || snapshot.teamPanel.teamId !== null
        || snapshot.solutionPanel.visible || snapshot.solutionPanel.proposal !== null
        || snapshot.teamCollaboration.active;

      if (hasState) {
        cache[prevId] = snapshot;
        // Update LRU order: remove old position then push to end
        order = order.filter((x) => x !== prevId);
        order.push(prevId);
        // Evict oldest entries beyond the limit
        while (order.length > PANEL_CACHE_MAX) {
          const evicted = order.shift()!;
          delete cache[evicted];
        }
      }
    }

    // ── Restore panel state for the incoming conversation (or reset to defaults) ──
    const restored = cache[id!] ?? DEFAULT_PANELS;
    // Promote to most-recent if it was cached
    if (id && cache[id]) {
      order = order.filter((x) => x !== id);
      order.push(id);
    }

    return {
      activeConversationId: id,
      panelStateCache: cache,
      panelCacheOrder: order,
      questionnaireData: null,
      ...restored,
    };
  }),

  removeConversation: (id) =>
    set((state) => {
      const isActive = state.activeConversationId === id;
      // Clean up messages cache and panel cache for deleted conversation
      const { [id]: _removed, ...remainingMessages } = state.messages;
      const { [id]: _removedPanel, ...remainingPanelCache } = state.panelStateCache;
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversationId: isActive ? null : state.activeConversationId,
        messages: remainingMessages,
        panelStateCache: remainingPanelCache,
        panelCacheOrder: state.panelCacheOrder.filter((x) => x !== id),
        // Reset streaming state if the deleted conversation was actively streaming
        ...(isActive && state.isStreaming ? { isStreaming: false } : {}),
      };
    }),

  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  toggleHighlight: (conversationId) =>
    set((state) => {
      const conv = state.conversations.find((c) => c.id === conversationId);
      if (!conv) return state;
      const next = !conv.highlighted;
      // Persist to backend (fire-and-forget)
      fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlighted: next }),
      }).catch(() => {});
      return {
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, highlighted: next } : c
        ),
      };
    }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      // Deduplicate by ID (#18)
      if (existing.some(m => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message],
        },
      };
    }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  showPlanPanel: (assessment) =>
    set({
      planPanel: {
        visible: true,
        assessment,
        status: 'pending',
        stepStates: (assessment.plan_outline || []).map(() => ({ status: 'pending' as PlanStepStatus })),
      },
    }),

  hidePlanPanel: () =>
    set((state) => ({
      planPanel: { ...state.planPanel, visible: false },
    })),

  approvePlan: () =>
    set((state) => ({
      planPanel: { ...state.planPanel, status: 'approved' },
    })),

  rejectPlan: () =>
    set((state) => ({
      planPanel: { ...state.planPanel, status: 'rejected', visible: false },
    })),

  updatePlanStepProgress: (stepIndex, status, summary) =>
    set((state) => {
      // Ignore out-of-plan steps
      if (stepIndex < 0) return state;

      const stepStates = [...state.planPanel.stepStates];

      // Ensure array is large enough
      while (stepStates.length <= stepIndex) {
        stepStates.push({ status: 'pending' });
      }

      // When a new step becomes active, auto-complete any previously active step
      // (guards against Architect forgetting to report completion)
      if (status === 'active') {
        for (let i = 0; i < stepStates.length; i++) {
          if (stepStates[i].status === 'active') {
            stepStates[i] = { ...stepStates[i], status: 'completed' };
          }
        }
      }

      stepStates[stepIndex] = { status, summary };

      return {
        planPanel: { ...state.planPanel, stepStates },
      };
    }),

  showClarificationForm: (requirements) =>
    set({
      clarificationPanel: { visible: true, requirements },
    }),

  hideClarificationForm: () =>
    set((state) => ({
      clarificationPanel: { ...state.clarificationPanel, visible: false },
    })),

  showDmPanel: (decision) =>
    set({
      dmPanel: { visible: true, decision, status: 'pending' },
    }),

  hideDmPanel: () =>
    set({
      dmPanel: {
        visible: false,
        decision: null,
        status: 'idle',
      },
    }),

  approveDm: () =>
    set((state) => ({
      dmPanel: { ...state.dmPanel, status: 'approved' },
    })),

  rejectDm: () =>
    set((state) => ({
      dmPanel: { ...state.dmPanel, status: 'rejected', visible: false },
    })),

  showToolApproval: (data) =>
    set({
      toolApprovalPanel: {
        visible: true,
        approvalId: data.approvalId,
        toolName: data.toolName,
        toolArgs: data.toolArgs,
        agentName: data.agentName,
        status: 'pending',
      },
    }),

  hideToolApproval: () =>
    set({
      toolApprovalPanel: {
        visible: false,
        approvalId: null,
        toolName: null,
        toolArgs: null,
        agentName: null,
        status: 'idle',
      },
    }),

  approveToolExecution: () =>
    set((state) => ({
      toolApprovalPanel: { ...state.toolApprovalPanel, status: 'approved' },
    })),

  rejectToolExecution: () =>
    set((state) => ({
      toolApprovalPanel: { ...state.toolApprovalPanel, status: 'rejected', visible: false },
    })),

  showArchitectFailed: (data) =>
    set({
      architectPanel: {
        visible: true,
        status: 'failed',
        stepsCompleted: data.stepsCompleted,
        errorMessage: data.errorMessage,
        attempt: data.attempt,
      },
    }),

  hideArchitectPanel: () =>
    set({
      architectPanel: {
        visible: false,
        status: 'idle',
        stepsCompleted: 0,
        errorMessage: null,
        attempt: 0,
      },
    }),

  showTeamPanel: (teamId, agents) =>
    set({
      teamPanel: { visible: true, teamId, agents, communications: [] },
    }),

  hideTeamPanel: () =>
    set((state) => ({
      teamPanel: { ...state.teamPanel, visible: false },
    })),

  updateTeamStatus: (status) =>
    set((state) => ({
      teamPanel: {
        ...state.teamPanel,
        agents: status.agents,
      },
    })),

  addTeamCommunication: (message) =>
    set((state) => ({
      teamPanel: {
        ...state.teamPanel,
        communications: [...state.teamPanel.communications, message],
      },
    })),

  showSolutionPanel: (proposal) =>
    set({
      solutionPanel: {
        visible: true,
        proposal,
        selectedSolutionId: null,
        status: 'pending',
      },
    }),

  hideSolutionPanel: () =>
    set((state) => ({
      solutionPanel: { ...state.solutionPanel, visible: false },
    })),

  selectSolution: (solutionId) =>
    set((state) => ({
      solutionPanel: { ...state.solutionPanel, selectedSolutionId: solutionId },
    })),

  approveSolution: () =>
    set((state) => ({
      solutionPanel: { ...state.solutionPanel, status: 'approved' },
    })),

  rejectSolution: () =>
    set((state) => ({
      solutionPanel: { ...state.solutionPanel, status: 'rejected', visible: false },
    })),

  addStreamingStep: (step) =>
    set((state) => ({
      streamingSteps: [...state.streamingSteps, step],
    })),

  completeStreamingStep: (stepNumber, patch) =>
    set((state) => {
      // Find the last thinking step matching this stepNumber and patch it
      const steps = [...state.streamingSteps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].kind === 'thinking' && steps[i].stepNumber === stepNumber) {
          steps[i] = { ...steps[i], ...patch };
          break;
        }
      }
      return { streamingSteps: steps };
    }),

  clearStreamingSteps: () =>
    set({ streamingSteps: [] }),

  setTeamCollaborationActive: (active) =>
    set((state) => ({
      teamCollaboration: { ...state.teamCollaboration, active },
    })),

  setTeamCollaborationCollapsed: (collapsed) =>
    set((state) => ({
      teamCollaboration: { ...state.teamCollaboration, collapsed },
    })),

  addMateChatMessage: (agentName, role, content) =>
    set((state) => {
      const existing = state.mateChatMessages[agentName] ?? [];
      return {
        mateChatMessages: {
          ...state.mateChatMessages,
          [agentName]: [...existing, { role, content, timestamp: Date.now() }],
        },
      };
    }),

  appendMateStreamingToken: (agentName, token) =>
    set((state) => ({
      mateStreamingTokens: {
        ...state.mateStreamingTokens,
        [agentName]: (state.mateStreamingTokens[agentName] ?? '') + token,
      },
    })),

  clearMateStreamingTokens: (agentName) =>
    set((state) => {
      const { [agentName]: _, ...rest } = state.mateStreamingTokens;
      return { mateStreamingTokens: rest };
    }),

  clearAllMateState: () =>
    set({ mateChatMessages: {}, mateStreamingTokens: {}, agentLanePage: 0 }),

  setAgentLanePage: (page) =>
    set({ agentLanePage: page }),

  showCompactionUpgrade: (data) =>
    set({
      compactionUpgradePanel: {
        visible: true,
        upgradeId: data.upgradeId,
        tokenUsage: data.tokenUsage,
        timeoutAt: Date.now() + 30_000,
      },
    }),

  hideCompactionUpgrade: () =>
    set({
      compactionUpgradePanel: {
        visible: false,
        upgradeId: null,
        tokenUsage: null,
        timeoutAt: null,
      },
    }),

  showProjectUpgrade: (conversationId) =>
    set({ projectUpgradePanel: { visible: true, conversationId } }),
  hideProjectUpgrade: () =>
    set({ projectUpgradePanel: { visible: false, conversationId: null } }),

  setPendingTeamUpgrade: (data) =>
    set({ pendingTeamUpgrade: data }),

  clearPendingTeamUpgrade: () =>
    set({ pendingTeamUpgrade: null }),

  appendStreamingToken: (token) =>
    set((state) => {
      const sections = [...state.streamingSections];
      const last = sections[sections.length - 1];
      if (last && last.type === 'text') {
        sections[sections.length - 1] = { ...last, content: last.content + token };
      } else {
        sections.push({ type: 'text', content: token });
      }
      return { streamingSections: sections };
    }),

  startStreamingToolCall: (data) =>
    set((state) => ({
      streamingSections: [
        ...state.streamingSections,
        { type: 'tool_call' as const, ...data, status: 'running' as const },
      ],
    })),

  endStreamingToolCall: (data) =>
    set((state) => ({
      streamingSections: state.streamingSections.map((s) =>
        s.type === 'tool_call' && s.toolCallId === data.toolCallId
          ? { ...s, status: data.success ? 'success' as const : 'error' as const, resultPreview: data.resultPreview }
          : s
      ),
    })),

  resetStreamingState: () =>
    set({ streamingSections: [] }),

  setContextUsage: (usage) => set({ contextUsage: usage }),

  setQuestionnaireData: (data) => set({ questionnaireData: data }),
  clearQuestionnaireData: () => set({ questionnaireData: null }),

  setThinkingMode: (enabled) => set({ thinkingMode: enabled }),
  setSelectedFastModel: (modelId) => set({ selectedFastModel: modelId }),

  openStudioTab: (skillId, displayName) =>
    set((state) => {
      const exists = state.studioPanel.tabs.some((t) => t.skillId === skillId);
      if (exists) {
        return {
          studioPanel: { ...state.studioPanel, visible: true, activeTabId: skillId },
        };
      }
      return {
        studioPanel: {
          visible: true,
          tabs: [...state.studioPanel.tabs, { skillId, displayName }],
          activeTabId: skillId,
        },
      };
    }),

  closeStudioTab: (skillId) =>
    set((state) => {
      const tabs = state.studioPanel.tabs.filter((t) => t.skillId !== skillId);
      const wasActive = state.studioPanel.activeTabId === skillId;
      return {
        studioPanel: {
          visible: tabs.length > 0,
          tabs,
          activeTabId: wasActive ? (tabs[tabs.length - 1]?.skillId ?? null) : state.studioPanel.activeTabId,
        },
      };
    }),

  setActiveStudioTab: (skillId) =>
    set((state) => ({
      studioPanel: { ...state.studioPanel, activeTabId: skillId },
    })),

  hideStudioPanel: () =>
    set((state) => ({
      studioPanel: { ...state.studioPanel, visible: false },
    })),

  renameStudioTab: (skillId, newName) =>
    set((state) => ({
      studioPanel: {
        ...state.studioPanel,
        tabs: state.studioPanel.tabs.map((t) =>
          t.skillId === skillId ? { ...t, displayName: newName } : t,
        ),
      },
    })),

  setCurrentOrg: (orgId, orgName) => set({ currentOrgId: orgId, currentOrgName: orgName }),

  resetAllPanels: () =>
    set((state) => {
      const id = state.activeConversationId;
      // Also evict from cache so stale state doesn't resurface
      if (id && state.panelStateCache[id]) {
        const { [id]: _evicted, ...rest } = state.panelStateCache;
        return {
          ...DEFAULT_PANELS,
          projectUpgradePanel: { visible: false, conversationId: null },
          panelStateCache: rest,
          panelCacheOrder: state.panelCacheOrder.filter((x) => x !== id),
        };
      }
      return { ...DEFAULT_PANELS, projectUpgradePanel: { visible: false, conversationId: null } };
    }),
});
