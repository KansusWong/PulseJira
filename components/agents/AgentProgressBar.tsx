"use client";

import clsx from "clsx";
import { getAgentUIByStage } from "@/lib/config/agent-ui-meta";

interface AgentProgressBarProps {
  currentStage: 'idle' | 'prepare' | 'plan' | 'implement' | 'deploy';
  currentStep: number;
  totalSteps: number;
  activeAgents: Set<string>;
}

export function AgentProgressBar({ currentStage, currentStep, totalSteps, activeAgents }: AgentProgressBarProps) {
  if (currentStage === 'idle') return null;

  const agents = getAgentUIByStage(currentStage);
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Progress bar */}
      <div className="h-1 bg-zinc-900 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Agent pills */}
      <div className="flex items-center gap-2">
        {agents.map(({ name, ui }) => {
          const isActive = activeAgents.has(name);
          return (
            <div
              key={name}
              className={clsx(
                "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-bold transition-all",
                isActive
                  ? `${ui.color}/20 text-white ring-1 ring-${ui.color.replace('bg-', '')}/50`
                  : "bg-zinc-900 text-zinc-600"
              )}
            >
              <div className={clsx("w-1.5 h-1.5 rounded-full", isActive ? ui.color : "bg-zinc-700", isActive && "animate-pulse")} />
              {ui.label}
            </div>
          );
        })}

        {/* Connecting lines */}
        <div className="flex-1" />
        <span className="text-[10px] text-zinc-600 font-mono">
          {currentStage.toUpperCase()} {currentStep}/{totalSteps}
        </span>
      </div>
    </div>
  );
}
