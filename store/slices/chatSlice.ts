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
} from '@/lib/core/types';

export interface ChatSlice {
  // Conversation state
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId → messages
  isStreaming: boolean;

  // Plan panel state
  planPanel: {
    visible: boolean;
    assessment: ComplexityAssessment | null;
    status: 'pending' | 'approved' | 'rejected' | 'idle';
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

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  setActiveConversationId: (id: string | null) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;

  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;

  showPlanPanel: (assessment: ComplexityAssessment) => void;
  hidePlanPanel: () => void;
  approvePlan: () => void;
  rejectPlan: () => void;

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
}

export const createChatSlice: StateCreator<ChatSlice> = (set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isStreaming: false,

  planPanel: {
    visible: false,
    assessment: null,
    status: 'idle',
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

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
    })),

  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

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
      planPanel: { visible: true, assessment, status: 'pending' },
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
});
