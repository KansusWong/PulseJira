"use client";

import type { AgentStatus, StructuredAgentStep } from "@/lib/core/types";
import { AgentLane } from "./AgentLane";

interface Props {
  agents: AgentStatus[];
  agentStepsMap: Map<string, StructuredAgentStep[]>;
}

export function AgentLaneGrid({ agents, agentStepsMap }: Props) {
  const count = agents.length;

  const gridClass =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : count === 3
          ? "grid-cols-3"
          : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid ${gridClass} gap-3 p-3 max-h-[50vh] overflow-y-auto`}>
      {agents.map((agent) => (
        <AgentLane
          key={agent.name}
          agentName={agent.name}
          status={agent.status}
          currentTask={agent.current_task}
          steps={agentStepsMap.get(agent.name) || []}
        />
      ))}
    </div>
  );
}
