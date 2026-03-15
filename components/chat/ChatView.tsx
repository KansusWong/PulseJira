"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import type { ChatMessage, ChatEvent, StructuredAgentStep } from "@/lib/core/types";
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
  const clearStreamingSteps = usePulseStore((s) => s.clearStreamingSteps);
  const teamCollaborationActive = usePulseStore((s) => s.teamCollaboration.active);
  const setTeamCollaborationActive = usePulseStore((s) => s.setTeamCollaborationActive);

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

    // Fire-and-forget: warm agent caches (config, soul, tool schemas)
    // so the first message in this conversation is faster.
    fetch('/api/chat/preload', { method: 'POST' }).catch(() => {});
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

  const handleSend = useCallback(
    async (text: string) => {
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
    [addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, t]
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

            {/* Inline streaming bubble — text + tool calls interleaved */}
            {isStreaming && !teamCollaborationActive && streamingSections.length > 0 && (
              <StreamingBubble sections={streamingSections} />
            )}

            {/* Thinking indicator — only before first token arrives */}
            {isStreaming && !teamCollaborationActive && streamingSections.length === 0 && (
              <div className="mr-auto max-w-[85%] px-1 py-1">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking...</span>
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
