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
    <div className={clsx("border border-border rounded-lg overflow-hidden", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-900/50 transition-colors text-sm"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-zinc-300">{title}</span>
        </div>
        <ChevronDown className={clsx("w-4 h-4 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {children}
        </div>
      )}
    </div>
  );
}
