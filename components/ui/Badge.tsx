"use client";

import clsx from "clsx";
import { getAgentUI } from "@/lib/config/agent-ui-meta";

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

const variants: Record<string, string> = {
  default: "bg-zinc-800 text-zinc-300",
  success: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  warning: "bg-amber-500/20 text-amber-400",
  info: "bg-blue-500/20 text-blue-400",
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variantClass = variants[variant] || getAgentUI(variant)?.badgeClass || variants.default;
  return (
    <span className={clsx(
      "text-xs px-2 py-0.5 rounded font-mono inline-block",
      variantClass,
      className
    )}>
      {children}
    </span>
  );
}
