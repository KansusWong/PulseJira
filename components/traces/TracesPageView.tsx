"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Loader2, Activity, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { TraceCard, type ExecutionTrace } from "./TraceCard";
import { TraceDetailView } from "./TraceDetailView";

interface TracesPageViewProps {
  projectId: string;
}

const STAGES = ["prepare", "plan", "implement", "deploy", "meta"] as const;
const STATUSES = ["running", "completed", "failed"] as const;

export function TracesPageView({ projectId }: TracesPageViewProps) {
  const { t } = useTranslation();
  const [traces, setTraces] = useState<ExecutionTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    setFetchState("loading");
    const params = new URLSearchParams();
    if (stageFilter) params.set("stage", stageFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "50");

    fetch(`/api/projects/${projectId}/traces?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (json?.success) {
          setTraces(json.data || []);
        }
        setFetchState("idle");
      })
      .catch((err) => {
        console.error("[TracesPageView] Fetch failed:", err);
        setFetchState("error");
      });
  }, [projectId, stageFilter, statusFilter]);

  // Drill-down: show detail view
  if (selectedTraceId !== null) {
    return (
      <TraceDetailView
        projectId={projectId}
        traceId={selectedTraceId}
        onBack={() => setSelectedTraceId(null)}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Stage filters */}
        <button
          onClick={() => setStageFilter(null)}
          className={clsx(
            "text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors",
            stageFilter === null
              ? "bg-zinc-700 text-white border-zinc-600"
              : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-400"
          )}
        >
          {t("trace.filterAll")}
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(stageFilter === s ? null : s)}
            className={clsx(
              "text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors",
              stageFilter === s
                ? "bg-zinc-700 text-white border-zinc-600"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-400"
            )}
          >
            {s}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-4 bg-zinc-800 mx-1" />

        {/* Status filters */}
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={clsx(
              "text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors",
              statusFilter === s
                ? "bg-zinc-700 text-white border-zinc-600"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-400"
            )}
          >
            {t(`trace.${s}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      {fetchState === "loading" ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      ) : fetchState === "error" ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-8 h-8 text-red-500/60" />
          <p className="text-sm text-zinc-500">{t("trace.loadFailed")}</p>
          <button
            onClick={() => setStageFilter(stageFilter)}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : traces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Activity className="w-8 h-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">{t("trace.noTraces")}</p>
          <p className="text-xs text-zinc-600">{t("trace.noTracesHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {traces.map((tr) => (
            <TraceCard
              key={tr.trace_id}
              trace={tr}
              onClick={() => setSelectedTraceId(tr.trace_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
