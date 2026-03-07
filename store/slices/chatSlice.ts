import type { StateCreator } from 'zustand';
import type {
  Conversation,
  ChatMessage,
  ComplexityAssessment,
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
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [
          ...(state.messages[conversationId] || []),
          message,
        ],
      },
    })),

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
