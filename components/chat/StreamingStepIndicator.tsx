"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import type { StructuredAgentStep } from "@/lib/core/types";
import {
  type DisplayItem,
  buildDisplayItems,
  groupByAgent,
  formatDuration,
  getItemDuration,
  Bullet,
} from "./team/step-utils";

/** Maximum number of recent display items to show. */
const MAX_VISIBLE_ITEMS = 6;

interface Props {
  steps: StructuredAgentStep[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StreamingStepIndicator({ steps }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());

  // Tick every second for live timer on the active item
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (steps.length === 0) return null;

  const allItems = buildDisplayItems(steps);

  // Hide completed thinking steps — only keep the last one (active indicator)
  const filtered = allItems.filter(
    (item, idx) => item.type !== "thinking" || idx === allItems.length - 1,
  );

  const hiddenCount = Math.max(0, filtered.length - MAX_VISIBLE_ITEMS);
  const visibleItems = hiddenCount > 0 ? filtered.slice(-MAX_VISIBLE_ITEMS) : filtered;
  const groups = groupByAgent(visibleItems);
  const lastItem = filtered[filtered.length - 1];

  return (
    <div className="mr-auto max-w-[85%]">
      <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
        {hiddenCount > 0 && (
          <div className="text-[10px] text-zinc-600 mb-2">
            +{hiddenCount} earlier steps
          </div>
        )}
        <div className="space-y-3">
          {groups.map((group, gi) => {
            const ui = getAgentUI(group.agent);
            const badgeClass = ui?.badgeClass || "bg-zinc-500/20 text-zinc-400";
            const label = ui?.label || group.agent;
            const borderColor = ui?.borderColor || "border-zinc-500";

            return (
              <div key={gi} className={`border-l-2 ${borderColor} pl-3`}>
                {/* Agent badge */}
                <div className="mb-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}
                  >
                    {label}
                  </span>
                </div>

                {/* Display items */}
                <div className="space-y-1.5">
                  {group.items.map((item, ii) => {
                    const isLast = item === lastItem;
                    const nextInFiltered = filtered[filtered.indexOf(item) + 1];
                    const durationMs = getItemDuration(item, nextInFiltered, isLast, now);

                    // --- Thinking (only shown as active/last) ---
                    if (item.type === "thinking") {
                      return (
                        <div
                          key={item.step.id}
                          className="flex items-start gap-2 text-xs text-zinc-400"
                        >
                          <Bullet color="bg-blue-400" pulse />
                          <span className="flex-1">{t('streaming.thinking')}</span>
                          {durationMs !== null && (
                            <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                              {formatDuration(durationMs)}
                            </span>
                          )}
                          <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-zinc-500 animate-spin" />
                        </div>
                      );
                    }

                    // --- LLM text reasoning ---
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

                    // --- Tool call (+ optional result sub-line) ---
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
                          {/* Tool call line */}
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
                          {/* Result sub-line */}
                          {hasResult && (
                            <div
                              className={`ml-4 text-[10px] ${
                                success ? "text-zinc-500" : "text-red-400/70"
                              } break-words`}
                            >
                              └{" "}
                              {success
                                ? item.resultStep!.resultPreview || t('streaming.done')
                                : `${t('streaming.failed')}: ${item.resultStep!.resultPreview || t('streaming.unknownError')}`}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // --- Completion ---
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
