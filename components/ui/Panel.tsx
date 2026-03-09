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
    <div className={clsx("flex flex-col h-full border-r border-border bg-background last:border-r-0", className)}>
      <div className="h-12 border-b border-border flex items-center px-4 bg-paper/50 backdrop-blur-sm sticky top-0 z-10">
        {Icon && <Icon className="w-4 h-4 mr-2 text-zinc-500" />}
        <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 relative">
        {children}
      </div>
    </div>
  );
}
