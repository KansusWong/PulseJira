"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AgentStatus, StructuredAgentStep, AgentMailMessage } from "@/lib/core/types";
import { AgentLane } from "./AgentLane";

const AGENTS_PER_PAGE = 4;

interface MateChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Props {
  agents: AgentStatus[];
  agentStepsMap: Map<string, StructuredAgentStep[]>;
  page: number;
  onPageChange: (page: number) => void;
  teamId: string | null;
  mateChatMessages: Record<string, MateChatMessage[]>;
  mateStreamingTokens: Record<string, string>;
  communications?: AgentMailMessage[];
}

export function AgentLaneGrid({
  agents,
  agentStepsMap,
  page,
  onPageChange,
  teamId,
  mateChatMessages,
  mateStreamingTokens,
  communications = [],
}: Props) {
  // Group communications by agent name (messages sent from or to each agent)
  const commsMap = useMemo(() => {
    const map: Record<string, AgentMailMessage[]> = {};
    for (const msg of communications) {
      if (!map[msg.from_agent]) map[msg.from_agent] = [];
      map[msg.from_agent].push(msg);
      if (msg.to_agent !== msg.from_agent) {
        if (!map[msg.to_agent]) map[msg.to_agent] = [];
        map[msg.to_agent].push(msg);
      }
    }
    return map;
  }, [communications]);

  const totalPages = Math.ceil(agents.length / AGENTS_PER_PAGE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageAgents = agents.slice(safePage * AGENTS_PER_PAGE, (safePage + 1) * AGENTS_PER_PAGE);

  const gridColClass =
    pageAgents.length <= 1
      ? "grid-cols-1"
      : "grid-cols-2";
  const gridRowClass =
    pageAgents.length <= 2
      ? "grid-rows-1"
      : "grid-rows-2";

  const handleSendMessage = async (agentName: string, message: string) => {
    if (!teamId) return;
    try {
      await fetch(`/api/teams/${teamId}/agents/${encodeURIComponent(agentName)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    } catch {
      // Silent fail — message will be retried by user
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`grid ${gridColClass} ${gridRowClass} gap-3 p-3 flex-1 min-h-0`}>
        {pageAgents.map((agent) => (
          <AgentLane
            key={agent.name}
            agentName={agent.name}
            status={agent.status}
            currentTask={agent.current_task}
            steps={agentStepsMap.get(agent.name) || []}
            teamId={teamId}
            chatMessages={mateChatMessages[agent.name]}
            streamingContent={mateStreamingTokens[agent.name]}
            onSendMessage={(msg) => handleSendMessage(agent.name, msg)}
            communications={commsMap[agent.name]}
          />
        ))}
      </div>

      {/* Pagination bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-zinc-800/30">
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 0}
            className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages - 1}
            className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
