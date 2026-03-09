"use client";

import clsx from "clsx";
import { ChevronDown, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";

interface AgentStepCardProps {
  agent: string;
  message: string;
  type: 'start' | 'log' | 'tool' | 'complete';
  timestamp: number;
  children?: React.ReactNode;
}

const FALLBACK_CLASS = "border-l-zinc-500 text-zinc-400";

export function AgentStepCard({ agent, message, type, timestamp, children }: AgentStepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = getAgentUI(agent)?.stepCardClass || FALLBACK_CLASS;

  return (
    <div className={clsx("border-l-2 pl-3 py-1", colorClass.split(' ')[0])}>
      <div
        className={clsx("flex items-start gap-2 cursor-pointer", children && "hover:bg-zinc-900/30 -ml-3 -mr-1 pl-3 pr-1 rounded")}
        onClick={() => children && setExpanded(!expanded)}
      >
        {type === 'complete' ? (
          <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-500 flex-shrink-0" />
        ) : type === 'start' ? (
          <Loader2 className="w-3 h-3 mt-0.5 animate-spin flex-shrink-0" />
        ) : null}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-400 leading-relaxed break-words">{message}</p>
        </div>

        <span className="text-[9px] text-zinc-700 font-mono flex-shrink-0">
          {new Date(timestamp).toLocaleTimeString()}
        </span>

        {children && (
          <ChevronDown className={clsx("w-3 h-3 text-zinc-600 transition-transform flex-shrink-0", expanded && "rotate-180")} />
        )}
      </div>

      {expanded && children && (
        <div className="mt-2 ml-5 text-xs text-zinc-500 bg-zinc-900/30 rounded p-2">
          {children}
        </div>
      )}
    </div>
  );
}
