"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import { STAGE_COLORS, STATUS_COLORS, formatTraceDuration, formatTraceTimestamp } from "./trace-utils";

export interface ExecutionTrace {
  trace_id: string;
  project_id: string;
  stage: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
}

interface TraceCardProps {
  trace: ExecutionTrace;
  onClick: () => void;
}

export function TraceCard({ trace, onClick }: TraceCardProps) {
  const { t } = useTranslation();

  const summary = trace.summary as any;
  const eventCount = summary?.event_count ?? summary?.eventCount ?? null;
  const agentNames: string[] = summary?.agents ?? summary?.agent_names ?? [];
  const errorMsg =
    trace.status === "failed"
      ? summary?.error || summary?.message || null
      : null;

  return (
    <div
      onClick={onClick}
      className="bg-paper border border-border rounded-lg p-4 cursor-pointer hover:border-zinc-600 transition-colors"
    >
      {/* Row 1: Stage + Status + Timestamp */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "text-[10px] font-mono px-2 py-0.5 rounded-full border",
              STAGE_COLORS[trace.stage] || "bg-zinc-800 text-zinc-400 border-zinc-700"
            )}
          >
            {trace.stage}
          </span>
          <span
            className={clsx(
              "text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1",
              STATUS_COLORS[trace.status] || "bg-zinc-800 text-zinc-400 border-zinc-700"
            )}
          >
            {trace.status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            {trace.status}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">
          {formatTraceTimestamp(trace.started_at)}
        </span>
      </div>

      {/* Row 2: Duration, event count, agent pills */}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <span className="text-xs text-zinc-500">
          {t("trace.duration")}: {formatTraceDuration(trace.started_at, trace.completed_at)}
        </span>
        {eventCount != null && (
          <span className="text-xs text-zinc-500">
            {t("trace.events", { count: eventCount })}
          </span>
        )}
        {agentNames.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {agentNames.map((name: string) => {
              const ui = getAgentUI(name);
              return (
                <span
                  key={name}
                  className={clsx(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                    ui?.badgeClass || "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {ui?.label || name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 3 (failed only): Error summary */}
      {errorMsg && (
        <p className="text-xs text-red-400 truncate">{errorMsg}</p>
      )}
    </div>
  );
}
