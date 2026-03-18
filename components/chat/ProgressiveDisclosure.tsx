"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface ProgressiveDisclosureProps {
  /** Summary text shown when collapsed. */
  summary: string;
  /** Full content shown when expanded. */
  children: React.ReactNode;
  /** Whether to start expanded. */
  defaultOpen?: boolean;
  /** Visual variant. */
  variant?: "default" | "agent" | "tool" | "error";
  /** Whether this is currently active/streaming. */
  isActive?: boolean;
}

const variantStyles: Record<string, { border: string; bg: string; text: string }> = {
  default: {
    border: "border-[var(--border-subtle)]",
    bg: "bg-[var(--bg-glass)]",
    text: "text-[var(--text-secondary)]",
  },
  agent: {
    border: "border-indigo-500/20",
    bg: "bg-indigo-500/5",
    text: "text-indigo-300",
  },
  tool: {
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    text: "text-cyan-300",
  },
  error: {
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    text: "text-red-300",
  },
};

/**
 * Progressive disclosure component for chat messages.
 * Shows a summary by default, expandable to show full content.
 * Used for agent reasoning, tool calls, and execution details.
 */
export function ProgressiveDisclosure({
  summary,
  children,
  defaultOpen = false,
  variant = "default",
  isActive = false,
}: ProgressiveDisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const style = variantStyles[variant] || variantStyles.default;

  return (
    <div className={clsx("rounded-xl border", style.border, style.bg)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
        )}
        <span className={clsx("text-xs", style.text, isActive && "animate-pulse")}>
          {summary}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-0">
          <div className="border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-muted)]">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
