"use client";

import { useCallback } from "react";
import {
  X,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { ChatEvent } from "@/lib/core/types";

export function ArchitectResumePanel() {
  const panel = usePulseStore((s) => s.architectPanel);
  const hideArchitectPanel = usePulseStore((s) => s.hideArchitectPanel);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const addMessage = usePulseStore((s) => s.addMessage);
  const showTeamPanel = usePulseStore((s) => s.showTeamPanel);

  const { t } = useTranslation();

  const handleSSEStream = useCallback(
    async (response: Response) => {
      if (!response.ok || !response.body || !activeConversationId) return;
      const reader = response.body.getReader();
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
            if (event.type === "message") {
              addMessage(activeConversationId, {
                id: crypto.randomUUID(),
                conversation_id: activeConversationId,
                role: event.data.role || "assistant",
                content: event.data.content,
                metadata: event.data.metadata || null,
                created_at: new Date().toISOString(),
              });
            } else if (event.type === "team_update") {
              showTeamPanel(event.data.team_id, event.data.agents || []);
            } else if (event.type === "error") {
              addMessage(activeConversationId, {
                id: crypto.randomUUID(),
                conversation_id: activeConversationId,
                role: "system",
                content: `Error: ${event.data.message}`,
                metadata: null,
                created_at: new Date().toISOString(),
              });
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    },
    [activeConversationId, addMessage, showTeamPanel],
  );

  const handleResume = useCallback(async () => {
    hideArchitectPanel();

    if (activeConversationId) {
      try {
        const res = await fetch(
          `/api/conversations/${activeConversationId}/plan`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resume_architect" }),
          },
        );
        await handleSSEStream(res);
      } catch {
        // Error handling via SSE stream
      }
    }
  }, [activeConversationId, hideArchitectPanel, handleSSEStream]);

  const handleStartOver = useCallback(async () => {
    hideArchitectPanel();

    if (activeConversationId) {
      try {
        const res = await fetch(
          `/api/conversations/${activeConversationId}/plan`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve_dm" }),
          },
        );
        await handleSSEStream(res);
      } catch {
        // Error handling via SSE stream
      }
    }
  }, [activeConversationId, hideArchitectPanel, handleSSEStream]);

  if (!panel.visible) return null;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-200">
          {t("architect.failedTitle")}
        </h3>
        <button
          onClick={hideArchitectPanel}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Error Badge */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">
              {t("architect.pipelineFailed")}
            </span>
          </div>
          {panel.errorMessage && (
            <p className="text-xs text-red-300/70 leading-relaxed">
              {panel.errorMessage}
            </p>
          )}
        </div>

        {/* Steps Completed */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            {t("architect.stepsCompleted")}
          </div>
          <div className="text-lg font-mono text-zinc-300">
            {panel.stepsCompleted}
          </div>
        </div>

        {/* Attempt */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            {t("architect.attempt")}
          </div>
          <div className="text-sm text-zinc-400">
            {t("architect.attemptOf", { current: String(panel.attempt), max: "3" })}
          </div>
        </div>

        {/* Info */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500 leading-relaxed">
            {panel.attempt >= 3
              ? t("architect.maxRetriesReached")
              : t("architect.resumeHint")}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/50">
        {panel.attempt < 3 && (
          <button
            onClick={handleResume}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t("architect.resume")}
          </button>
        )}
        <button
          onClick={handleStartOver}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {t("architect.startOver")}
        </button>
      </div>
    </div>
  );
}
