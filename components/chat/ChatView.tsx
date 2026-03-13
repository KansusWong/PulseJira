"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import type { ChatMessage, ChatEvent, ComplexityAssessment, DecisionOutput, StructuredRequirements, StructuredAgentStep, CodeSolutionProposal } from "@/lib/core/types";
import { StreamingStepIndicator } from "./StreamingStepIndicator";
import { TeamCollaborationView } from "./team/TeamCollaborationView";

export function ChatView() {
  const { t } = useTranslation();
  const router = useRouter();
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const messages = usePulseStore((s) =>
    activeConversationId ? s.messages[activeConversationId] || [] : []
  );
  const addMessage = usePulseStore((s) => s.addMessage);
  const isStreaming = usePulseStore((s) => s.isStreaming);
  const setStreaming = usePulseStore((s) => s.setStreaming);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);
  const addConversation = usePulseStore((s) => s.addConversation);
  const showPlanPanel = usePulseStore((s) => s.showPlanPanel);
  const showTeamPanel = usePulseStore((s) => s.showTeamPanel);
  const updateTeamStatus = usePulseStore((s) => s.updateTeamStatus);
  const showClarificationForm = usePulseStore((s) => s.showClarificationForm);
  const showDmPanel = usePulseStore((s) => s.showDmPanel);
  const showToolApproval = usePulseStore((s) => s.showToolApproval);
  const hideToolApproval = usePulseStore((s) => s.hideToolApproval);
  const showArchitectFailed = usePulseStore((s) => s.showArchitectFailed);
  const hideArchitectPanel = usePulseStore((s) => s.hideArchitectPanel);
  const showSolutionPanel = usePulseStore((s) => s.showSolutionPanel);
  const addProject = usePulseStore((s) => s.addProject);
  const setRunning = usePulseStore((s) => s.setRunning);
  const addAgentLog = usePulseStore((s) => s.addAgentLog);
  const updatePlanStepProgress = usePulseStore((s) => s.updatePlanStepProgress);
  const addTeamCommunication = usePulseStore((s) => s.addTeamCommunication);

  // Streaming steps — now in store (shared with TeamCollaborationView)
  const streamingSteps = usePulseStore((s) => s.streamingSteps);
  const addStreamingStep = usePulseStore((s) => s.addStreamingStep);
  const clearStreamingSteps = usePulseStore((s) => s.clearStreamingSteps);
  const teamCollaborationActive = usePulseStore((s) => s.teamCollaboration.active);
  const setTeamCollaborationActive = usePulseStore((s) => s.setTeamCollaborationActive);

  const setMessages = usePulseStore((s) => s.setMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch user execution mode preference
  const [execMode, setExecMode] = useState<'simple' | 'medium' | null>(null);

  useEffect(() => {
    fetch('/api/settings/preferences')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.preferences) {
          setExecMode(json.data.preferences.agentExecutionMode || 'simple');
        }
      })
      .catch(() => {});
  }, []);

  // Abort active stream if conversation changes or is deleted
  useEffect(() => {
    if (!activeConversationId && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [activeConversationId]);

  // Fetch messages from API when switching conversations
  useEffect(() => {
    if (!activeConversationId) return;
    if (fetchedRef.current === activeConversationId) return;
    fetchedRef.current = activeConversationId;

    fetch(`/api/conversations/${activeConversationId}/messages?limit=200`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setMessages(activeConversationId, json.data);
        }
      })
      .catch((err) => console.error('[ChatView] Failed to load messages:', err));
  }, [activeConversationId, setMessages]);

  // 恢复 plan panel（刷新页面后的 fallback）
  useEffect(() => {
    if (!activeConversationId) return;

    // 已经在显示 → 跳过
    const { planPanel } = usePulseStore.getState();
    if (planPanel.visible && planPanel.assessment) return;

    // 找到 store 中的 conversation
    const conv = usePulseStore.getState().conversations.find(
      (c) => c.id === activeConversationId
    );
    // 已执行（有 project）或已归档 → 不恢复
    if (conv?.project_id || (conv && conv.status !== 'active')) return;

    // 快速路径：store 中已有 assessment（localStorage 恢复）
    if (conv?.complexity_assessment) {
      showPlanPanel(conv.complexity_assessment);
      return;
    }

    // 慢速路径：从 API 拉取
    const currentConvId = activeConversationId;
    fetch(`/api/conversations/${currentConvId}/plan`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success || !json.data?.assessment) return;
        // 防竞态：用户可能已切走
        const currentState = usePulseStore.getState();
        if (currentState.activeConversationId !== currentConvId) return;
        if (currentState.planPanel.visible && currentState.planPanel.assessment) return;
        showPlanPanel(json.data.assessment);
      })
      .catch(() => {});
  }, [activeConversationId, showPlanPanel]);

  // Auto-scroll to bottom — only on new messages, not on streaming step updates.
  // Also skip if the user has scrolled up (not near bottom).
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // "Near bottom" = within 150px of the bottom edge
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      // If currently streaming, abort the previous generation first
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      setStreaming(true);
      clearStreamingSteps();
      setTeamCollaborationActive(false);

      const abortController = new AbortController();
      abortRef.current = abortController;

      const streamTimeout = setTimeout(() => {
        abortController.abort();
        setStreaming(false);
        clearStreamingSteps();
        setTeamCollaborationActive(false);
      }, 5 * 60 * 1000);

      let conversationId = activeConversationId;

      // If no active conversation, create one
      if (!conversationId) {
        conversationId = crypto.randomUUID();
        addConversation({
          id: conversationId,
          title: text.slice(0, 80),
          status: "active",
          project_id: null,
          complexity_assessment: null,
          execution_mode: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setActiveConversationId(conversationId);
      }

      // Add user message to local state
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: text,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      addMessage(conversationId, userMsg);

      // Stream from API
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
          }),
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to connect to chat API");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event: ChatEvent = JSON.parse(line.slice(6));
              handleSSEEvent(event, conversationId!);
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } catch (error: any) {
        // Don't show error message for intentional aborts (timeout or unmount)
        if (error?.name !== 'AbortError') {
          addMessage(conversationId!, {
            id: crypto.randomUUID(),
            conversation_id: conversationId!,
            role: "system",
            content: `Error: ${error.message}`,
            metadata: null,
            created_at: new Date().toISOString(),
          });
        }
      } finally {
        clearTimeout(streamTimeout);
        abortRef.current = null;
        setStreaming(false);
        clearStreamingSteps();
        setTeamCollaborationActive(false);
      }
    },
    [activeConversationId, addMessage, setStreaming, setActiveConversationId, addConversation, showPlanPanel, showTeamPanel, updateTeamStatus, showClarificationForm, showDmPanel, showToolApproval, hideToolApproval, showArchitectFailed, hideArchitectPanel, clearStreamingSteps, setTeamCollaborationActive]
  );

  const handleSSEEvent = useCallback(
    (event: ChatEvent, conversationId: string) => {
      switch (event.type) {
        case "message": {
          const msg: ChatMessage = {
            id: event.data.id || crypto.randomUUID(),
            conversation_id: conversationId,
            role: event.data.role || "assistant",
            content: event.data.content,
            metadata: event.data.metadata || null,
            created_at: event.data.created_at || new Date().toISOString(),
          };
          addMessage(conversationId, msg);
          break;
        }

        case "plan_assessment": {
          const assessment = event.data as ComplexityAssessment;

          // Add plan message to chat
          addMessage(conversationId, {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            role: "plan",
            content: `**Complexity Assessment:** ${assessment.complexity_level}\n**Mode:** ${assessment.execution_mode}\n**Rationale:** ${assessment.rationale}`,
            metadata: { assessment },
            created_at: new Date().toISOString(),
          });
          break;
        }

        case "plan_update": {
          if (event.data.status === "pending_approval") {
            showPlanPanel(event.data.assessment);
            // 持久化 assessment 到 conversation 对象 (→ localStorage)
            const updateConv = usePulseStore.getState().updateConversation;
            updateConv(conversationId, {
              complexity_assessment: event.data.assessment,
              execution_mode: event.data.assessment.execution_mode,
            });
          }
          break;
        }

        case "team_update": {
          const currentPanel = usePulseStore.getState().teamPanel;
          if (currentPanel.visible && currentPanel.teamId === event.data.team_id) {
            updateTeamStatus({ agents: event.data.agents || [] } as any);
          } else {
            showTeamPanel(event.data.team_id, event.data.agents || []);
          }
          setTeamCollaborationActive(true);
          break;
        }

        case "agent_log": {
          if (event.data.message) {
            const step: StructuredAgentStep = event.data.step || {
              id: crypto.randomUUID(),
              agent: event.data.agent || 'system',
              kind: 'thinking' as const,
              message: event.data.message,
              timestamp: Date.now(),
            };
            addStreamingStep(step);
            addAgentLog({ agent: step.agent || 'system', type: 'log', message: event.data.message });
          }
          break;
        }

        case "team_comms": {
          const currentTeamId = usePulseStore.getState().teamPanel.teamId;
          addTeamCommunication({
            id: event.data.id || crypto.randomUUID(),
            team_id: event.data.team_id || currentTeamId || '',
            from_agent: event.data.from_agent,
            to_agent: event.data.to_agent,
            message_type: event.data.message_type || 'message',
            payload: event.data.payload,
            read: false,
            created_at: event.data.created_at || new Date().toISOString(),
          });
          break;
        }

        case "plan_step_progress": {
          updatePlanStepProgress(
            event.data.step_index,
            event.data.status,
            event.data.summary,
          );
          break;
        }

        case "dm_decision": {
          const dmDecision = event.data as DecisionOutput;
          if (dmDecision.decision === 'PROCEED') {
            showDmPanel(dmDecision);
          }
          break;
        }

        case "clarification_form": {
          const requirements = event.data as StructuredRequirements;
          showClarificationForm(requirements);
          break;
        }

        case "project_created": {
          const { project_id, name, is_light } = event.data;
          addMessage(conversationId, {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            role: "system",
            content: is_light
              ? `Light project created: **${name}**`
              : `Project created: **${name}**`,
            metadata: event.data,
            created_at: new Date().toISOString(),
          });
          if (project_id) {
            addProject({
              id: project_id,
              name,
              description: '',
              status: 'analyzing',
              is_light: !!is_light,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            setRunning(true, project_id);
            router.push(`/projects/${project_id}`);
          }
          break;
        }

        case "tool_approval_required": {
          showToolApproval({
            approvalId: event.data.approval_id,
            toolName: event.data.tool_name,
            toolArgs: event.data.tool_args,
            agentName: event.data.agent_name,
          });
          break;
        }

        case "solution_proposal": {
          if (event.data.status === "pending_selection") {
            const proposal = event.data.proposal as CodeSolutionProposal;
            showSolutionPanel(proposal);
          }
          break;
        }

        case "tool_approval_resolved": {
          hideToolApproval();
          break;
        }

        case "architect_failed": {
          showArchitectFailed({
            errorMessage: event.data.message,
            stepsCompleted: event.data.steps_completed ?? 0,
            attempt: event.data.attempt ?? 1,
          });
          break;
        }

        case "architect_resuming": {
          hideArchitectPanel();
          break;
        }

        case "sub_agent_start": {
          const agentName = event.data.agent_name || "sub-agent";
          const task = event.data.task || "";
          addStreamingStep({
            id: `sub-start-${agentName}-${Date.now()}`,
            agent: agentName,
            kind: "thinking",
            message: task ? `子智能体启动: ${task}` : `子智能体「${agentName}」启动中...`,
            timestamp: Date.now(),
          });
          break;
        }

        case "sub_agent_complete": {
          const agentName = event.data.agent_name || "sub-agent";
          const success = event.data.status === "success";
          const durationMs = event.data.duration_ms;
          const durationStr = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : "";
          addStreamingStep({
            id: `sub-done-${agentName}-${Date.now()}`,
            agent: agentName,
            kind: "completion",
            success,
            message: success
              ? `子智能体「${agentName}」已完成${durationStr}`
              : `子智能体「${agentName}」执行失败${event.data.error ? `: ${event.data.error}` : ""}`,
            timestamp: Date.now(),
          });
          break;
        }

        case "done": {
          // Mark all active steps as completed on stream end
          const stepStates = usePulseStore.getState().planPanel.stepStates;
          stepStates.forEach((s, i) => {
            if (s.status === 'active') {
              updatePlanStepProgress(i, 'completed');
            }
          });
          setTeamCollaborationActive(false);
          break;
        }

        case "error": {
          addMessage(conversationId, {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            role: "system",
            content: `Error: ${event.data.message}`,
            metadata: null,
            created_at: new Date().toISOString(),
          });
          break;
        }
      }
    },
    [addMessage, showPlanPanel, showTeamPanel, showClarificationForm, showDmPanel, showToolApproval, hideToolApproval, showArchitectFailed, hideArchitectPanel, addAgentLog, updatePlanStepProgress, addStreamingStep, addTeamCommunication, setTeamCollaborationActive]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Mode badge — sticky top-left */}
        {execMode && (
          <div className="sticky top-0 z-10 px-4 pt-3">
            <span className={
              execMode === 'medium'
                ? "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                : "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-500 border border-green-500/20"
            }>
              <span className={
                execMode === 'medium'
                  ? "w-1.5 h-1.5 rounded-full bg-yellow-400"
                  : "w-1.5 h-1.5 rounded-full bg-green-400"
              } />
              {execMode === 'medium' ? t('chat.modeTeam') : t('chat.modeSimple')}
            </span>
          </div>
        )}

        {messages.length === 0 ? (
          <EmptyState onSend={handleSend} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Team collaboration view — replaces StreamingStepIndicator in team mode */}
            {teamCollaborationActive && isStreaming && (
              <div className="max-w-none -mx-4">
                <TeamCollaborationView />
              </div>
            )}

            {/* Streaming indicator — normal (non-team) mode only */}
            {isStreaming && !teamCollaborationActive && streamingSteps.length > 0 && (
              <StreamingStepIndicator steps={streamingSteps} />
            )}

            {isStreaming && !teamCollaborationActive && streamingSteps.length === 0 && (
              <div className="mr-auto">
                <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <ChatInput onSubmit={handleSend} streaming={isStreaming} />
      </div>
    </div>
  );
}

function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="flex flex-col items-center max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-zinc-500" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">RebuilD</h1>
        <p className="text-sm text-zinc-500 mb-8">
          {t('chat.emptyDescription')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {[
            { label: t('chat.quickQuestion'), example: t('chat.quickQuestionExample') },
            { label: t('chat.smallTask'), example: t('chat.smallTaskExample') },
            { label: t('chat.featureBuild'), example: t('chat.featureBuildExample') },
            { label: t('chat.systemDesign'), example: t('chat.systemDesignExample') },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => onSend(item.example)}
              className="text-left px-4 py-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-800/40 hover:border-zinc-700/60 transition-all group cursor-pointer"
            >
              <div className="text-xs font-medium text-zinc-500 mb-1">{item.label}</div>
              <div className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors line-clamp-2">
                {item.example}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
