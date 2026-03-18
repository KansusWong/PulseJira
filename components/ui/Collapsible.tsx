"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function Collapsible({ title, children, defaultOpen = false, icon, className }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={clsx("border border-[var(--border-subtle)] rounded-lg overflow-hidden", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-hover)] transition-colors text-sm"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-[var(--text-secondary)]">{title}</span>
        </div>
        <ChevronDown className={clsx("w-4 h-4 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-[var(--border-subtle)] p-3">
          {children}
        </div>
      )}
    </div>
  );
}
