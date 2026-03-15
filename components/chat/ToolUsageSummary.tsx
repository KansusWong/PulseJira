"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export interface ToolStepSummary {
  toolName: string;
  toolLabel?: string;
  argSummary?: string;
  resultPreview?: string;
  success?: boolean;
}

interface ToolUsageSummaryProps {
  items: ToolStepSummary[];
}

export function ToolUsageSummary({ items }: ToolUsageSummaryProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) return null;


  return (
    <div className="mt-2 border-t border-zinc-800/40 pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span>
          {t("chat.toolsUsed", { count: String(items.length) })}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] font-mono text-zinc-500 pl-4"
            >
              <span className="shrink-0 mt-px">
                {item.success === false ? "✗" : "✓"}
              </span>
              <span className="text-zinc-400">
                {item.toolLabel || item.toolName}
              </span>
              {item.argSummary && (
                <span className="text-zinc-600 truncate max-w-[200px]">
                  ({item.argSummary})
                </span>
              )}
              {item.resultPreview && (
                <>
                  <span className="text-zinc-700">→</span>
                  <span className="text-zinc-600 truncate max-w-[200px]">
                    {item.resultPreview}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
