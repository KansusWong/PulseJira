"use client";

import clsx from "clsx";
import { getAgentUI } from "@/lib/config/agent-ui-meta";

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

const variants: Record<string, string> = {
  default: "bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
  success: "bg-green-500/10 text-green-400 border border-green-500/20",
  error: "bg-red-500/10 text-red-400 border border-red-500/20",
  warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  accent: "bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--border-accent)]",
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variantClass = variants[variant] || getAgentUI(variant)?.badgeClass || variants.default;
  return (
    <span className={clsx(
      "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full inline-block",
      variantClass,
      className
    )}>
      {children}
    </span>
  );
}
