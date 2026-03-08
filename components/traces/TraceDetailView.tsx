"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import { STAGE_COLORS, STATUS_COLORS, formatTraceDuration, formatTraceTimestamp } from "./trace-utils";
import { TraceEventCard } from "./TraceEventCard";

interface ExecutionEvent {
  id?: number;
  seq: number;
  event_type: string;
  agent_name: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface TraceDetail {
  trace_id: string;
  project_id: string;
  stage: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
}

interface TraceDetailViewProps {
  projectId: string;
  traceId: string;
  onBack: () => void;
}

export function TraceDetailView({ projectId, traceId, onBack }: TraceDetailViewProps) {
  const { t } = useTranslation();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [fetchState, setFetchState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    setFetchState("loading");
    fetch(`/api/projects/${projectId}/traces/${traceId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (json?.success && json.data) {
          setTrace(json.data.trace);
          setEvents(json.data.events || []);
        }
        setFetchState("done");
      })
      .catch((err) => {
        console.error("[TraceDetailView] Fetch failed:", err);
        setFetchState("error");
      });
  }, [projectId, traceId]);

  // Derive unique agent names from events
  const agentNames = Array.from(new Set(events.map((e) => e.agent_name).filter(Boolean))) as string[];

  // Error message from summary
  const errorMessage =
    trace?.status === "failed" && trace.summary
      ? (trace.summary as any).error || (trace.summary as any).message || null
      : null;

  // Loading state
  if (fetchState === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
      </div>
    );
  }

  // Error state
  if (fetchState === "error" || !trace) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-8 h-8 text-red-500/60" />
        <p className="text-sm text-zinc-500">{t("trace.loadFailed")}</p>
        <button
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {t("trace.backToList")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t("trace.backToList")}
      </button>

      {/* Summary header card */}
      <div className="bg-paper border border-border rounded-xl p-5 space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
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
              "text-[10px] font-mono px-2 py-0.5 rounded-full border",
              STATUS_COLORS[trace.status] || "bg-zinc-800 text-zinc-400 border-zinc-700"
            )}
          >
            {trace.status}
          </span>
        </div>

        {/* Time info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-zinc-600">Start: </span>
            <span className="text-zinc-400 font-mono">{formatTraceTimestamp(trace.started_at)}</span>
          </div>
          <div>
            <span className="text-zinc-600">End: </span>
            <span className="text-zinc-400 font-mono">
              {trace.completed_at ? formatTraceTimestamp(trace.completed_at) : "--"}
            </span>
          </div>
          <div>
            <span className="text-zinc-600">{t("trace.duration")}: </span>
            <span className="text-zinc-400 font-mono">
              {formatTraceDuration(trace.started_at, trace.completed_at)}
            </span>
          </div>
          <div>
            <span className="text-zinc-600">{t("trace.events", { count: events.length })}</span>
          </div>
        </div>

        {/* Participating agents */}
        {agentNames.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-zinc-600">{t("trace.agents")}:</span>
            {agentNames.map((name) => {
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

        {/* Error message */}
        {errorMessage && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {errorMessage}
          </p>
        )}
      </div>

      {/* Event timeline */}
      <div>
        <h3 className="text-xs text-zinc-500 font-mono mb-3">{t("trace.eventTimeline")}</h3>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-8">{t("trace.noEvents")}</p>
        ) : (
          <div className="space-y-1">
            {events.map((ev) => (
              <TraceEventCard key={ev.id ?? ev.seq} event={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
