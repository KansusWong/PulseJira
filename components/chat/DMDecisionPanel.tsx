"use client";

import { useCallback } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { ChatEvent } from "@/lib/core/types";

const riskColors: Record<string, string> = {
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
};

const riskI18nKeys: Record<string, string> = {
  low: "dm.riskLow",
  medium: "dm.riskMedium",
  high: "dm.riskHigh",
  critical: "dm.riskCritical",
};

export function DMDecisionPanel() {
  const decision = usePulseStore((s) => s.dmPanel.decision);
  const status = usePulseStore((s) => s.dmPanel.status);
  const hideDmPanel = usePulseStore((s) => s.hideDmPanel);
  const approveDm = usePulseStore((s) => s.approveDm);
  const rejectDm = usePulseStore((s) => s.rejectDm);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const addMessage = usePulseStore((s) => s.addMessage);
  const showTeamPanel = usePulseStore((s) => s.showTeamPanel);
  const showToolApproval = usePulseStore((s) => s.showToolApproval);
  const hideToolApproval = usePulseStore((s) => s.hideToolApproval);
  const showArchitectFailed = usePulseStore((s) => s.showArchitectFailed);

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
            } else if (event.type === "tool_approval_required") {
              showToolApproval({
                approvalId: event.data.approval_id,
                toolName: event.data.tool_name,
                toolArgs: event.data.tool_args,
                agentName: event.data.agent_name,
              });
            } else if (event.type === "tool_approval_resolved") {
              hideToolApproval();
            } else if (event.type === "architect_failed") {
              showArchitectFailed({
                errorMessage: event.data.message,
                stepsCompleted: event.data.steps_completed ?? 0,
                attempt: event.data.attempt ?? 1,
              });
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
    [activeConversationId, addMessage, showTeamPanel, showToolApproval, hideToolApproval, showArchitectFailed],
  );

  const handleApprove = useCallback(async () => {
    approveDm();

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
  }, [activeConversationId, approveDm, handleSSEStream]);

  const handleReject = useCallback(async () => {
    rejectDm();

    if (activeConversationId) {
      try {
        await fetch(
          `/api/conversations/${activeConversationId}/plan`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reject_dm" }),
          },
        );
      } catch {
        // Ignore
      }
    }
  }, [activeConversationId, rejectDm]);

  if (!decision) return null;

  const confidencePercent = Math.round(decision.confidence * 100);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-200">
          {t("dm.title")}
        </h3>
        <button
          onClick={hideDmPanel}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Decision Badge */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">
              {t("dm.decision")}: {decision.decision}
            </span>
          </div>
        </div>

        {/* Confidence */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            {t("dm.confidence")}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-sm font-mono text-zinc-300">
              {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Risk Level */}
        <div
          className={clsx(
            "rounded-xl border p-4",
            riskColors[decision.risk_level] || riskColors.low,
          )}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t("dm.riskLevel")}:{" "}
              {t(riskI18nKeys[decision.risk_level] || "dm.riskLow")}
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            {t("dm.summary")}
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {decision.summary}
          </p>
        </div>

        {/* Rationale */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            {t("dm.rationale")}
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {decision.rationale}
          </p>
        </div>

        {/* Risk Factors */}
        {decision.risk_factors.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-3">
              {t("dm.riskFactors")}
            </div>
            <ul className="space-y-1.5">
              {decision.risk_factors.map((factor, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-zinc-400"
                >
                  <span className="text-zinc-600 mt-0.5">-</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Actions */}
        {decision.recommended_actions.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-3">
              {t("dm.recommendedActions")}
            </div>
            <ul className="space-y-1.5">
              {decision.recommended_actions.map((action, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-zinc-400"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] flex items-center justify-center font-mono">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      {status === "pending" && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/50">
          <button
            onClick={handleApprove}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {t("dm.approve")}
          </button>
          <button
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            {t("dm.reject")}
          </button>
        </div>
      )}

      {status === "approved" && (
        <div className="px-4 py-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("dm.approved")}
          </div>
        </div>
      )}
    </div>
  );
}
