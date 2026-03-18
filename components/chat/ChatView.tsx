"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import type { ChatMessage, ChatEvent, StructuredAgentStep, AttachmentMeta } from "@/lib/core/types";
import type { ToolStepSummary } from "./ToolUsageSummary";
import { StreamingBubble } from "./StreamingBubble";
import { TeamCollaborationView } from "./team/TeamCollaborationView";
import { QuestionnaireInline } from "./QuestionnaireInline";
import { CompactionUpgradeCard } from "./CompactionUpgradeCard";

/** Build tool usage summary from streaming steps for message metadata. */
function buildToolUsageSummary(steps: StructuredAgentStep[]): ToolStepSummary[] {
  const result: ToolStepSummary[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.kind === "tool_call") {
      const next = steps[i + 1];
      if (next?.kind === "tool_result") {
        result.push({
          toolName: step.toolName || "unknown",
          toolLabel: step.toolLabel,
          argSummary: step.argSummary,
          resultPreview: next.resultPreview,
          success: next.success,
        });
        i += 2;
      } else {
        result.push({
          toolName: step.toolName || "unknown",
          toolLabel: step.toolLabel,
          argSummary: step.argSummary,
          success: undefined,
        });
        i++;
      }
    } else {
      i++;
    }
  }
  return result;
}

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
  const showToolApproval = usePulseStore((s) => s.showToolApproval);
  const hideToolApproval = usePulseStore((s) => s.hideToolApproval);
  const addProject = usePulseStore((s) => s.addProject);
  const setRunning = usePulseStore((s) => s.setRunning);
  const addAgentLog = usePulseStore((s) => s.addAgentLog);

  // Streaming steps — now in store (shared with TeamCollaborationView)
  const streamingSteps = usePulseStore((s) => s.streamingSteps);
  const addStreamingStep = usePulseStore((s) => s.addStreamingStep);
  const completeStreamingStep = usePulseStore((s) => s.completeStreamingStep);
  const clearStreamingSteps = usePulseStore((s) => s.clearStreamingSteps);
  const teamCollaborationActive = usePulseStore((s) => s.teamCollaboration.active);
  const setTeamCollaborationActive = usePulseStore((s) => s.setTeamCollaborationActive);

  const addMateChatMessage = usePulseStore((s) => s.addMateChatMessage);
  const appendMateStreamingToken = usePulseStore((s) => s.appendMateStreamingToken);
  const clearMateStreamingTokens = usePulseStore((s) => s.clearMateStreamingTokens);
  const clearAllMateState = usePulseStore((s) => s.clearAllMateState);

  const questionnaireData = usePulseStore((s) => s.questionnaireData);
  const setQuestionnaireData = usePulseStore((s) => s.setQuestionnaireData);
  const clearQuestionnaireData = usePulseStore((s) => s.clearQuestionnaireData);

  const compactionUpgradePanel = usePulseStore((s) => s.compactionUpgradePanel);
  const showCompactionUpgrade = usePulseStore((s) => s.showCompactionUpgrade);
  const hideCompactionUpgrade = usePulseStore((s) => s.hideCompactionUpgrade);
  const setPendingTeamUpgrade = usePulseStore((s) => s.setPendingTeamUpgrade);
  const clearPendingTeamUpgrade = usePulseStore((s) => s.clearPendingTeamUpgrade);

  // Streaming sections state (inline bubble)
  const streamingSections = usePulseStore((s) => s.streamingSections);
  const appendStreamingToken = usePulseStore((s) => s.appendStreamingToken);
  const startStreamingToolCall = usePulseStore((s) => s.startStreamingToolCall);
  const endStreamingToolCall = usePulseStore((s) => s.endStreamingToolCall);
  const resetStreamingState = usePulseStore((s) => s.resetStreamingState);
  const contextUsage = usePulseStore((s) => s.contextUsage);
  const setContextUsage = usePulseStore((s) => s.setContextUsage);
  const thinkingMode = usePulseStore((s) => s.thinkingMode);
  const setThinkingMode = usePulseStore((s) => s.setThinkingMode);
  const selectedFastModel = usePulseStore((s) => s.selectedFastModel);
  const setSelectedFastModel = usePulseStore((s) => s.setSelectedFastModel);

  // RAF-based token buffering to avoid excessive re-renders
  const tokenBufferRef = useRef('');
  const rafRef = useRef<number>();
  const handleTokenBatch = useCallback(() => {
    if (tokenBufferRef.current) {
      appendStreamingToken(tokenBufferRef.current);
      tokenBufferRef.current = '';
    }
    rafRef.current = undefined;
  }, [appendStreamingToken]);

  const handleToken = useCallback((token: string) => {
    tokenBufferRef.current += token;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(handleTokenBatch);
    }
  }, [handleTokenBatch]);

  const setMessages = usePulseStore((s) => s.setMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
  }, [messages, streamingSections]);

  const handleStop = useCallback(() => {
    if (!abortRef.current) return;

    const conversationId = activeConversationId;
    if (!conversationId) return;

    // Flush any buffered tokens
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    tokenBufferRef.current = '';

    // Collect partial content from streaming sections
    const sections = usePulseStore.getState().streamingSections;
    const partialContent = sections
      .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
      .map((s) => s.content)
      .join('');

    // Abort the stream
    abortRef.current.abort();
    abortRef.current = null;

    // Save partial response as a message with stopped flag
    if (partialContent.trim()) {
      const currentSteps = usePulseStore.getState().streamingSteps;
      const toolSteps = buildToolUsageSummary(currentSteps);

      addMessage(conversationId, {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: 'assistant',
        content: partialContent,
        metadata: {
          stopped: true,
          ...(toolSteps.length > 0 ? { toolSteps } : {}),
        },
        created_at: new Date().toISOString(),
      });
    }

    // Reset all streaming state
    resetStreamingState();
    setStreaming(false);
    clearStreamingSteps();
    setTeamCollaborationActive(false);
  }, [activeConversationId, addMessage, resetStreamingState, setStreaming, clearStreamingSteps, setTeamCollaborationActive]);

  const handleSend = useCallback(
    async (text: string, attachments?: AttachmentMeta[]) => {
      // If currently streaming, abort the previous generation first
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      // Auto-reject any pending compaction upgrade
      const upgradePanel = usePulseStore.getState().compactionUpgradePanel;
      if (upgradePanel.visible && upgradePanel.upgradeId) {
        fetch(`/api/conversations/${activeConversationId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject_upgrade",
            upgrade_id: upgradePanel.upgradeId,
          }),
        }).catch(() => {});
        hideCompactionUpgrade();
      }

      clearQuestionnaireData();
      resetStreamingState();
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
        metadata: attachments?.length ? { attachments } : null,
        created_at: new Date().toISOString(),
      };
      addMessage(conversationId, userMsg);

      // Stream from API
      try {
        const currentThinkingMode = usePulseStore.getState().thinkingMode;
        const currentFastModel = usePulseStore.getState().selectedFastModel;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
            attachments: attachments || undefined,
            thinking: currentThinkingMode || undefined,
            model: (!currentThinkingMode && currentFastModel) || undefined,
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

        // Auto-bridge: if team upgrade was approved, trigger second SSE stream
        const upgradeState = usePulseStore.getState().pendingTeamUpgrade;
        if (upgradeState) {
          clearPendingTeamUpgrade();
          try {
            const res2 = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversation_id: conversationId,
                message: `[TEAM_INIT] Create a team from the current session.`,
                team_init: true,
                state_summary: upgradeState.stateSummary,
              }),
              signal: abortController.signal,
            });

            if (res2.ok && res2.body) {
              const reader2 = res2.body.getReader();
              let buffer2 = "";
              while (true) {
                const { done: done2, value: value2 } = await reader2.read();
                if (done2) break;
                buffer2 += decoder.decode(value2, { stream: true });
                const lines2 = buffer2.split("\n");
                buffer2 = lines2.pop() || "";
                for (const line2 of lines2) {
                  if (!line2.startsWith("data: ")) continue;
                  try {
                    const event2: ChatEvent = JSON.parse(line2.slice(6));
                    handleSSEEvent(event2, conversationId!);
                  } catch { /* skip */ }
                }
              }
            }
          } catch (bridgeErr: any) {
            if (bridgeErr?.name !== "AbortError") {
              console.error("[ChatView] Team init bridge failed:", bridgeErr);
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
        resetStreamingState();
        setTeamCollaborationActive(false);
        clearAllMateState();
        // Flush any remaining token buffer
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = undefined;
        }
        tokenBufferRef.current = '';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeConversationId, addMessage, setStreaming, setActiveConversationId, addConversation, showPlanPanel, showToolApproval, hideToolApproval, clearStreamingSteps, setTeamCollaborationActive, clearQuestionnaireData, hideCompactionUpgrade, clearPendingTeamUpgrade, resetStreamingState]
  );

  const handleSSEEvent = useCallback(
    (event: ChatEvent, conversationId: string) => {
      switch (event.type) {
        case "message": {
          // Flush token buffer
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = undefined;
          }
          tokenBufferRef.current = '';

          // Snapshot tool steps before they get cleared in finally block
          const currentSteps = usePulseStore.getState().streamingSteps;
          const toolSteps = buildToolUsageSummary(currentSteps);

          const msg: ChatMessage = {
            id: event.data.id || crypto.randomUUID(),
            conversation_id: conversationId,
            role: event.data.role || "assistant",
            content: event.data.content,
            metadata: {
              ...(event.data.metadata || {}),
              ...(toolSteps.length > 0 ? { toolSteps } : {}),
            },
            created_at: event.data.created_at || new Date().toISOString(),
          };
          // Add message first, then reset streaming — React batches both in same render
          addMessage(conversationId, msg);
          resetStreamingState();
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
            // Don't navigate mid-stream — let the user decide when to visit the project
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

        case "tool_approval_resolved": {
          hideToolApproval();
          break;
        }

        case "sub_agent_start": {
          const agentName = event.data.agent_name || "sub-agent";
          const task = event.data.task || "";
          addStreamingStep({
            id: `sub-start-${agentName}-${Date.now()}`,
            agent: agentName,
            kind: "thinking",
            message: task ? `${t('streaming.subAgentStart')}: ${task}` : `${t('streaming.subAgentStarting', { name: agentName })}`,
            timestamp: Date.now(),
          });
          break;
        }

        case "sub_agent_complete": {
          const agentName = event.data.agent_name || "sub-agent";
          const success = event.data.status === "success";
          const durationMs = event.data.duration_ms;
          const durationStr = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : "";
          // Flush streaming tokens to chat history
          const streamedContent = usePulseStore.getState().mateStreamingTokens[agentName];
          if (streamedContent) {
            addMateChatMessage(agentName, 'assistant', streamedContent);
            clearMateStreamingTokens(agentName);
          }
          addStreamingStep({
            id: `sub-done-${agentName}-${Date.now()}`,
            agent: agentName,
            kind: "completion",
            success,
            message: success
              ? `${t('streaming.subAgentComplete', { name: agentName })}${durationStr}`
              : `${t('streaming.subAgentFailed', { name: agentName })}${event.data.error ? `: ${event.data.error}` : ""}`,
            timestamp: Date.now(),
          });
          break;
        }

        case "mate_token": {
          appendMateStreamingToken(event.data.agent, event.data.content);
          break;
        }

        case "questionnaire": {
          setQuestionnaireData(event.data);
          break;
        }

        case "compaction_upgrade_required": {
          showCompactionUpgrade({
            upgradeId: event.data.upgrade_id,
            tokenUsage: event.data.token_usage,
          });
          break;
        }

        case "compaction_upgrade_resolved": {
          hideCompactionUpgrade();
          break;
        }

        case "team_upgrade": {
          setPendingTeamUpgrade({
            stateSummary: event.data.stateSummary,
            conversationId,
          });
          break;
        }

        case "step_start": {
          // New ReAct step starting — streaming will follow
          break;
        }

        case "step_complete": {
          // ReAct step finished — patch the thinking step with model & duration
          const { stepNumber, model, durationMs } = event.data;
          completeStreamingStep(stepNumber, { model, durationMs });
          break;
        }

        case "context_usage": {
          setContextUsage(event.data);
          break;
        }

        case "token": {
          handleToken(event.data.content);
          break;
        }

        case "reasoning_token": {
          // Reasoning tokens are captured but not displayed inline currently
          // Could be shown in a collapsible "thinking" section
          break;
        }

        case "tool_call_start": {
          startStreamingToolCall({
            toolName: event.data.toolName,
            toolLabel: event.data.toolLabel,
            toolCallId: event.data.toolCallId,
            args: event.data.args,
          });
          break;
        }

        case "tool_call_end": {
          endStreamingToolCall({
            toolCallId: event.data.toolCallId,
            resultPreview: event.data.result,
            success: event.data.success !== false,
          });
          break;
        }

        case "done": {
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
    [addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, completeStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, setContextUsage, t]
  );

  const teamFullscreen = teamCollaborationActive && isStreaming;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      {/* Messages area — shrinks when team is fullscreen */}
      <div ref={scrollContainerRef} className={`${teamFullscreen ? 'flex-shrink-0 max-h-[15vh]' : 'flex-1'} overflow-y-auto`}>
        {messages.length === 0 ? (
          <EmptyState onSend={handleSend} />
        ) : (
          <>
            {/* Messages — constrained width for readability */}
            <div className="max-w-[680px] mx-auto px-4 pt-6 space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>

            {/* Post-team content — constrained width */}
            {!teamFullscreen && (
              <div className="max-w-[680px] mx-auto px-4 pb-6 space-y-4">
                {/* Inline streaming bubble — text + tool calls interleaved */}
                {isStreaming && streamingSections.length > 0 && (
                  <StreamingBubble sections={streamingSections} />
                )}

                {/* Thinking indicator — only before first token arrives */}
                {isStreaming && streamingSections.length === 0 && (
                  <div className="mr-auto max-w-[85%] px-1 py-1">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('streaming.thinking')}</span>
                    </div>
                  </div>
                )}

                {/* Compaction upgrade card — takes priority over questionnaire */}
                {compactionUpgradePanel.visible && compactionUpgradePanel.upgradeId && activeConversationId && (
                  <CompactionUpgradeCard
                    upgradeId={compactionUpgradePanel.upgradeId}
                    tokenUsage={compactionUpgradePanel.tokenUsage!}
                    timeoutAt={compactionUpgradePanel.timeoutAt!}
                    conversationId={activeConversationId}
                    onResolved={(approved) => {
                      hideCompactionUpgrade();
                    }}
                  />
                )}

                {/* Normal questionnaire — only when no upgrade card visible */}
                {questionnaireData && !isStreaming && !compactionUpgradePanel.visible && (
                  <QuestionnaireInline
                    data={questionnaireData}
                    onSubmit={(text) => { clearQuestionnaireData(); handleSend(text); }}
                    onDismiss={clearQuestionnaireData}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Team collaboration view — fills remaining viewport outside scroll area */}
      {teamFullscreen && (
        <div className="flex-1 min-h-0 flex flex-col px-3 pb-2">
          <TeamCollaborationView />
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <ChatInput onSubmit={handleSend} onStop={handleStop} streaming={isStreaming} thinkingMode={thinkingMode} onThinkingModeChange={setThinkingMode} selectedFastModel={selectedFastModel} onFastModelChange={setSelectedFastModel} conversationId={activeConversationId ?? undefined} />
      </div>
    </div>
  );
}

function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="flex flex-col items-center max-w-[680px] text-center">
        {/* RebuilD logo - 64px amber square */}
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-black" />
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-8">
          {t('chat.emptyDescription') || 'Start a new conversation'}
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
              className="text-left px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-focus)] transition-all group cursor-pointer"
            >
              <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">{item.label}</div>
              <div className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors line-clamp-2">
                {item.example}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
