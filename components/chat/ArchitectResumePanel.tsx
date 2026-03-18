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
import { processSSEResponse } from "@/lib/utils/sse-stream";

export function ArchitectResumePanel() {
  const panel = usePulseStore((s) => s.architectPanel);
  const hideArchitectPanel = usePulseStore((s) => s.hideArchitectPanel);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);

  const { t } = useTranslation();

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
        await processSSEResponse(res, activeConversationId);
      } catch {
        // Error handling via SSE stream
      }
    }
  }, [activeConversationId, hideArchitectPanel]);

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
        await processSSEResponse(res, activeConversationId);
      } catch {
        // Error handling via SSE stream
      }
    }
  }, [activeConversationId, hideArchitectPanel]);

  if (!panel.visible) return null;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("architect.failedTitle")}
        </h3>
        <button
          onClick={hideArchitectPanel}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
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
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("architect.stepsCompleted")}
          </div>
          <div className="text-lg font-mono text-[var(--text-primary)]">
            {panel.stepsCompleted}
          </div>
        </div>

        {/* Attempt */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
            {t("architect.attempt")}
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            {t("architect.attemptOf", { current: String(panel.attempt), max: "3" })}
          </div>
        </div>

        {/* Info */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {panel.attempt >= 3
              ? t("architect.maxRetriesReached")
              : t("architect.resumeHint")}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
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
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {t("architect.startOver")}
        </button>
      </div>
    </div>
  );
}
