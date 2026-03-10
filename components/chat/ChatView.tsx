"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import type { ChatMessage, ChatEvent, ComplexityAssessment, DecisionOutput, StructuredRequirements } from "@/lib/core/types";

export function ChatView() {
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
  const showClarificationForm = usePulseStore((s) => s.showClarificationForm);
  const showDmPanel = usePulseStore((s) => s.showDmPanel);
  const showToolApproval = usePulseStore((s) => s.showToolApproval);
  const hideToolApproval = usePulseStore((s) => s.hideToolApproval);
  const showArchitectFailed = usePulseStore((s) => s.showArchitectFailed);
  const hideArchitectPanel = usePulseStore((s) => s.hideArchitectPanel);

  const setMessages = usePulseStore((s) => s.setMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef<string | null>(null);
  const [streamingText, setStreamingText] = useState("");

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleSend = useCallback(
    async (text: string) => {
      setStreaming(true);
      setStreamingText("");

      const abortController = new AbortController();

      const streamTimeout = setTimeout(() => {
        abortController.abort();
        setStreaming(false);
        setStreamingText("");
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
        setStreaming(false);
        setStreamingText("");
      }
    },
    [activeConversationId, addMessage, setStreaming, setActiveConversationId, addConversation, showPlanPanel, showTeamPanel, showClarificationForm, showDmPanel, showToolApproval, hideToolApproval, showArchitectFailed, hideArchitectPanel]
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
          showPlanPanel(assessment);

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
          }
          break;
        }

        case "team_update": {
          showTeamPanel(event.data.team_id, event.data.agents || []);
          break;
        }

        case "agent_log": {
          // Show agent activity as system messages
          if (event.data.message) {
            setStreamingText(event.data.message);
          }
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
          const { name, is_light } = event.data;
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

        case "done": {
          // Explicit stream completion signal
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
    [addMessage, showPlanPanel, showTeamPanel, showClarificationForm, showDmPanel, showToolApproval, hideToolApproval, showArchitectFailed, hideArchitectPanel]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming indicator */}
            {isStreaming && streamingText && (
              <div className="mr-auto max-w-[85%]">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[11px] font-medium text-zinc-500">RebuilD</span>
                </div>
                <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50 text-zinc-400 text-sm">
                  <span className="animate-pulse">{streamingText}</span>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && (
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
        <ChatInput onSubmit={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}

function EmptyState() {
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
              className="text-left px-4 py-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-800/40 hover:border-zinc-700/60 transition-all group"
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
