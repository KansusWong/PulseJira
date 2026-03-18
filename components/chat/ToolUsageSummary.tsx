"use client";

import { Check, X } from "lucide-react";

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
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-1">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"
        >
          <span className="shrink-0">
            {item.success === false ? (
              <X className="w-3 h-3 text-red-400/70" />
            ) : (
              <Check className="w-3 h-3 text-emerald-500/70" />
            )}
          </span>
          <span className="text-[var(--text-secondary)] font-mono">
            {item.toolLabel || item.toolName}
          </span>
          {item.argSummary && (
            <span className="text-[var(--text-muted)] truncate max-w-[200px]">
              ({item.argSummary})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
