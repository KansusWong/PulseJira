"use client";

import { useState, useEffect, useRef } from "react";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { formatDuration } from "./step-utils";
import type { AgentStatus } from "@/lib/core/types";

interface Props {
  agents: AgentStatus[];
  collapsed: boolean;
  onToggle: () => void;
}

export function TeamStatusBar({ agents, collapsed, onToggle }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const workingCount = agents.filter(
    (a) => a.status === "working" || a.status === "active",
  ).length;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/50 cursor-pointer select-none"
      onClick={onToggle}
    >
      <Users className="w-4 h-4 text-zinc-400 shrink-0" />
      <span className="text-xs font-semibold text-zinc-200">
        {t("team.collaboration.title")}
      </span>

      <span className="text-[10px] text-zinc-500">|</span>
      <span className="text-[10px] text-zinc-400">
        {t("team.collaboration.agents").replace("{count}", String(agents.length))}
      </span>

      <span className="text-[10px] text-zinc-500">|</span>
      <span className="text-[10px] text-cyan-400">
        {t("team.collaboration.working").replace("{count}", String(workingCount))}
      </span>

      <span className="text-[10px] text-zinc-500">|</span>
      <span className="text-[10px] text-zinc-400 tabular-nums">
        {formatDuration(elapsed)}
      </span>

      {/* Agent mini-dots */}
      <div className="flex items-center gap-1 ml-auto">
        {agents.map((a) => {
          const ui = getAgentUI(a.name);
          const dotColor =
            a.status === "working" || a.status === "active"
              ? ui?.color || "bg-cyan-500"
              : a.status === "completed"
                ? "bg-emerald-500"
                : a.status === "failed"
                  ? "bg-red-500"
                  : "bg-zinc-600";
          return (
            <span
              key={a.name}
              title={`${a.name} (${a.status})`}
              className={`w-2 h-2 rounded-full ${dotColor} ${
                a.status === "working" ? "animate-pulse" : ""
              }`}
            />
          );
        })}
      </div>

      <button className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
