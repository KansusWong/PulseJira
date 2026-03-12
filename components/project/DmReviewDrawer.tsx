"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/lib/i18n";
import type { DecisionOutput } from "@/lib/core/types";

type DrawerPhase =
  | "idle"
  | "dm_running"
  | "dm_complete"
  | "architect_running"
  | "architect_complete"
  | "error";

interface LogEntry {
  id: number;
  message: string;
  timestamp: number;
}

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

interface DmReviewDrawerProps {
  conversationId: string;
  onClose: () => void;
  requirements?: {
    summary: string;
    goals: string[];
    scope: string;
    constraints: string[];
    suggested_name: string;
  };
}

export function DmReviewDrawer({ conversationId, onClose, requirements }: DmReviewDrawerProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<DrawerPhase>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [decision, setDecision] = useState<DecisionOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const logIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: ++logIdRef.current, message, timestamp: Date.now() },
    ]);
  }, []);

  const readSSE = useCallback(
    async (response: Response, onDmDecision?: (d: DecisionOutput) => void) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const trimmed = chunk.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(trimmed.slice(6));
            if (msg.type === "agent_log" || msg.type === "log" || msg.type === "message") {
              addLog(msg.message || msg.data?.message || "");
            } else if (msg.type === "dm_decision") {
              onDmDecision?.(msg.data as DecisionOutput);
            } else if (msg.type === "error") {
              setErrorMsg(msg.data?.message || msg.error || "Unknown error");
              setPhase("error");
            } else if (msg.type === "tool_approval_required") {
              addLog(`[Tool Approval] ${msg.data?.tool_name || "tool"}: ${msg.data?.description || ""}`);
            }
            // heartbeat, done — ignored
          } catch {
            /* skip parse errors */
          }
        }
      }
    },
    [addLog],
  );

  const handleStartDm = useCallback(async () => {
    setPhase("dm_running");
    setLogs([]);
    setDecision(null);
    setErrorMsg("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/conversations/${conversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_dm_review", ...(requirements && { requirements }) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setPhase("error");
        return;
      }

      let receivedDecision = false;
      await readSSE(res, (d) => {
        receivedDecision = true;
        setDecision(d);
        setPhase("dm_complete");
      });

      // If stream ended without a decision, DM likely returned HALT
      if (!receivedDecision) {
        setPhase("dm_complete");
        // decision remains null — UI will show halt message
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setErrorMsg(e.message || "Unknown error");
        setPhase("error");
      }
    }
  }, [conversationId, requirements, readSSE]);

  const handleApprove = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setPhase("architect_running");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/conversations/${conversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_dm" }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setPhase("error");
        return;
      }

      await readSSE(res);
      setPhase("architect_complete");
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setErrorMsg(e.message || "Unknown error");
        setPhase("error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [conversationId, isSubmitting, readSSE]);

  const handleReject = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetch(`/api/conversations/${conversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_dm" }),
      });
    } catch {
      // best-effort
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  }, [conversationId, isSubmitting, onClose]);

  const confidencePercent = decision ? Math.round(decision.confidence * 100) : 0;
  const isProceed = decision?.decision === "PROCEED";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-200">
              {t("dm.drawerTitle")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Idle — start button */}
          {phase === "idle" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Shield className="w-10 h-10 text-zinc-700 mb-4" />
              <Button size="sm" onClick={handleStartDm}>
                <Play className="w-3 h-3 mr-1" />
                {t("dm.startReview")}
              </Button>
            </div>
          )}

          {/* DM Running — logs with spinner */}
          {phase === "dm_running" && (
            <>
              <div className="flex items-center gap-2 text-sm text-blue-400 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("dm.dmRunning")}
              </div>
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="text-xs text-zinc-500 font-mono leading-relaxed">
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </>
          )}

          {/* DM Complete — decision card or halt message */}
          {phase === "dm_complete" && (
            <>
              {/* Show logs from DM phase */}
              {logs.length > 0 && (
                <details className="group">
                  <summary className="text-[10px] uppercase tracking-wider text-zinc-600 cursor-pointer hover:text-zinc-400 mb-2">
                    DM Logs ({logs.length})
                  </summary>
                  <div className="space-y-1 mb-4 max-h-40 overflow-y-auto">
                    {logs.map((log) => (
                      <div key={log.id} className="text-xs text-zinc-600 font-mono leading-relaxed">
                        {log.message}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {decision && isProceed ? (
                <>
                  {/* Decision Badge */}
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2">
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
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
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
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] flex items-center justify-center font-mono">
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                /* No decision or HALT */
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-medium text-yellow-400">
                      {decision ? `${t("dm.decision")}: ${decision.decision}` : t("dm.dmHalted")}
                    </span>
                  </div>
                  {decision?.summary && (
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                      {decision.summary}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Architect Running — logs with spinner */}
          {phase === "architect_running" && (
            <>
              <div className="flex items-center gap-2 text-sm text-blue-400 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("dm.architectRunning")}
              </div>
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="text-xs text-zinc-500 font-mono leading-relaxed">
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </>
          )}

          {/* Architect Complete */}
          {phase === "architect_complete" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  {t("dm.architectComplete")}
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "dm_complete" && isProceed && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/50">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {t("dm.approve")}
            </button>
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              {t("dm.reject")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
