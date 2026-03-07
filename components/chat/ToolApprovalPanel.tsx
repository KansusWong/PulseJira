"use client";

import { useCallback } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";

export function ToolApprovalPanel() {
  const { t } = useTranslation();
  const panel = usePulseStore((s) => s.toolApprovalPanel);
  const approveToolExecution = usePulseStore((s) => s.approveToolExecution);
  const rejectToolExecution = usePulseStore((s) => s.rejectToolExecution);
  const hideToolApproval = usePulseStore((s) => s.hideToolApproval);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);

  const handleApprove = useCallback(async () => {
    if (!activeConversationId || !panel.approvalId) return;
    approveToolExecution();

    try {
      await fetch(`/api/conversations/${activeConversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_tool",
          approval_id: panel.approvalId,
        }),
      });
    } catch {
      // Error handled by SSE stream
    }
  }, [activeConversationId, panel.approvalId, approveToolExecution]);

  const handleReject = useCallback(async () => {
    if (!activeConversationId || !panel.approvalId) return;
    rejectToolExecution();

    try {
      await fetch(`/api/conversations/${activeConversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_tool",
          approval_id: panel.approvalId,
        }),
      });
    } catch {
      // Error handled by SSE stream
    }
  }, [activeConversationId, panel.approvalId, rejectToolExecution]);

  if (!panel.visible) return null;

  const isResolved = panel.status === "approved" || panel.status === "rejected";

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-100">
            {t("toolApproval.title")}
          </h3>
        </div>
        <button
          onClick={hideToolApproval}
          className="p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tool name */}
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">
            {t("toolApproval.toolName")}
          </label>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-mono">
            {panel.toolName}
          </span>
        </div>

        {/* Agent name */}
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">
            {t("toolApproval.agent")}
          </label>
          <span className="text-sm text-zinc-300">{panel.agentName}</span>
        </div>

        {/* Arguments */}
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">
            {t("toolApproval.arguments")}
          </label>
          <pre className="text-xs text-zinc-400 bg-zinc-900/80 border border-zinc-800/50 rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
            {JSON.stringify(panel.toolArgs, null, 2)}
          </pre>
        </div>

        {/* Warning */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs text-amber-400/80">
            {t("toolApproval.warning")}
          </p>
        </div>

        {/* Status message for resolved state */}
        {panel.status === "approved" && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-xs text-emerald-400">
              {t("toolApproval.approved")}
            </p>
          </div>
        )}

        {panel.status === "rejected" && (
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
            <p className="text-xs text-zinc-400">
              {t("toolApproval.rejected")}
            </p>
          </div>
        )}
      </div>

      {/* Footer — action buttons */}
      {!isResolved && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-zinc-800/50">
          <button
            onClick={handleApprove}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            {t("toolApproval.approve")}
          </button>
          <button
            onClick={handleReject}
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors"
          >
            {t("toolApproval.reject")}
          </button>
        </div>
      )}
    </div>
  );
}
