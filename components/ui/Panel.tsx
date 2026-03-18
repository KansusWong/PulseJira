"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  title: string;
  icon?: LucideIcon;
}

export function Panel({ children, className, title, icon: Icon }: PanelProps) {
  return (
    <div className={clsx("flex flex-col h-full border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] last:border-r-0", className)}>
      <div className="h-12 border-b border-[var(--border-subtle)] flex items-center px-4 bg-[var(--bg-glass)] backdrop-blur-sm sticky top-0 z-10">
        {Icon && <Icon className="w-4 h-4 mr-2 text-[var(--text-muted)]" />}
        <span className="text-xs font-mono font-bold tracking-wider text-[var(--text-primary)] uppercase">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 relative">
        {children}
      </div>
    </div>
  );
}
