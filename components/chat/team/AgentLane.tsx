"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import type { StructuredAgentStep, AgentStatus } from "@/lib/core/types";
import {
  buildDisplayItems,
  formatDuration,
  getItemDuration,
  Bullet,
} from "./step-utils";

const MAX_LANE_ITEMS = 4;

const statusColors: Record<string, string> = {
  active: "text-emerald-400",
  working: "text-cyan-400 animate-pulse",
  idle: "text-zinc-600",
  completed: "text-blue-400",
  failed: "text-red-400",
};

interface Props {
  agentName: string;
  status: AgentStatus["status"];
  currentTask?: string;
  steps: StructuredAgentStep[];
}

export function AgentLane({ agentName, status, currentTask, steps }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const ui = getAgentUI(agentName);
  const borderColor = ui?.borderColor || "border-zinc-500";
  const badgeClass = ui?.badgeClass || "bg-zinc-500/20 text-zinc-400";
  const label = ui?.label || agentName;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const allItems = buildDisplayItems(steps);

  // Filter out completed thinking steps (keep last only)
  const filtered = allItems.filter(
    (item, idx) => item.type !== "thinking" || idx === allItems.length - 1,
  );

  const hiddenCount = Math.max(0, filtered.length - MAX_LANE_ITEMS);
  const visibleItems = hiddenCount > 0 ? filtered.slice(-MAX_LANE_ITEMS) : filtered;
  const lastItem = filtered[filtered.length - 1];

  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isIdle = status === "idle";

  return (
    <div
      className={`flex flex-col border-l-2 ${borderColor} rounded-lg bg-zinc-900/50 border border-zinc-800/50 overflow-hidden ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/30">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}
          >
            {label}
          </span>
          <span className="text-xs text-zinc-400 truncate max-w-[120px]">
            {agentName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {isFailed && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
          {!isCompleted && !isFailed && (
            <span
              className={`w-2 h-2 rounded-full ${
                status === "working" || status === "active"
                  ? "bg-cyan-400 animate-pulse"
                  : "bg-zinc-600"
              }`}
            />
          )}
          <span
            className={`text-[10px] capitalize ${statusColors[status] || "text-zinc-600"}`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Steps body */}
      <div className="flex-1 max-h-[280px] overflow-y-auto px-3 py-2 space-y-1.5">
        {hiddenCount > 0 && (
          <div className="text-[10px] text-zinc-600 mb-1">
            {t("team.collaboration.earlierSteps").replace(
              "{count}",
              String(hiddenCount),
            )}
          </div>
        )}

        {isIdle && visibleItems.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
            {t("team.collaboration.waitingForTask")}
          </div>
        )}

        {isFailed && visibleItems.length === 0 && (
          <div className="text-xs text-red-400/70 py-2">
            {t("team.collaboration.agentFailed")}
          </div>
        )}

        {visibleItems.map((item) => {
          const isLast = item === lastItem;
          const nextInFiltered = filtered[filtered.indexOf(item) + 1];
          const durationMs = getItemDuration(item, nextInFiltered, isLast, now);

          if (item.type === "thinking") {
            return (
              <div
                key={item.step.id}
                className="flex items-start gap-2 text-xs text-zinc-400"
              >
                <Bullet color="bg-blue-400" pulse />
                <span className="flex-1 truncate">{item.step.message || "..."}</span>
                {durationMs !== null && (
                  <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                    {formatDuration(durationMs)}
                  </span>
                )}
                <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-zinc-500 animate-spin" />
              </div>
            );
          }

          if (item.type === "text") {
            return (
              <div
                key={item.step.id}
                className="flex items-start gap-2 text-xs text-zinc-300"
              >
                <Bullet color="bg-zinc-500" />
                <span className="flex-1 min-w-0 line-clamp-2">
                  {item.step.message}
                </span>
                {isLast && (
                  <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-zinc-500 animate-spin" />
                )}
              </div>
            );
          }

          if (item.type === "tool") {
            const hasResult = !!item.resultStep;
            const success = item.resultStep?.success !== false;
            const bulletColor = !hasResult
              ? "bg-blue-400"
              : success
                ? "bg-emerald-500"
                : "bg-red-500";

            const toolLabel =
              item.callStep.toolLabel || item.callStep.toolName || "tool";
            const argSummary = item.callStep.argSummary;
            const displayName = argSummary
              ? `${toolLabel}(${argSummary})`
              : toolLabel;

            return (
              <div key={item.callStep.id} className="space-y-0.5">
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <Bullet color={bulletColor} pulse={!hasResult && isLast} />
                  <span className="flex-1 min-w-0 font-mono text-[11px] truncate">
                    {displayName}
                  </span>
                  {durationMs !== null && (
                    <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums">
                      {formatDuration(durationMs)}
                    </span>
                  )}
                  {isLast && !hasResult && (
                    <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-zinc-500 animate-spin" />
                  )}
                </div>
                {hasResult && (
                  <div
                    className={`ml-4 text-[10px] ${
                      success ? "text-zinc-500" : "text-red-400/70"
                    } break-words`}
                  >
                    └ {success ? item.resultStep!.resultPreview || "完成" : `失败: ${item.resultStep!.resultPreview || "?"}`}
                  </div>
                )}
              </div>
            );
          }

          // completion
          return (
            <div
              key={item.step.id}
              className="flex items-start gap-2 text-xs text-emerald-400/80"
            >
              <Bullet color="bg-emerald-500" />
              <span>{item.step.message}</span>
            </div>
          );
        })}
      </div>

      {/* Footer: current task */}
      {currentTask && (
        <div className="px-3 py-1.5 border-t border-zinc-800/30 text-[10px] text-zinc-500 truncate">
          {currentTask}
        </div>
      )}
    </div>
  );
}
