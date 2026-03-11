"use client";

import { usePulseStore } from "@/store/usePulseStore.new";
import { useAgentSteps } from "./useAgentSteps";
import { TeamStatusBar } from "./TeamStatusBar";
import { AgentLaneGrid } from "./AgentLaneGrid";
import { TeamCommunicationBar } from "./TeamCommunicationBar";
import { TeamInterventionInput } from "./TeamInterventionInput";

export function TeamCollaborationView() {
  const agents = usePulseStore((s) => s.teamPanel.agents);
  const teamId = usePulseStore((s) => s.teamPanel.teamId);
  const collapsed = usePulseStore((s) => s.teamCollaboration.collapsed);
  const setCollapsed = usePulseStore((s) => s.setTeamCollaborationCollapsed);
  const communications = usePulseStore((s) => s.teamPanel.communications);
  const streamingSteps = usePulseStore((s) => s.streamingSteps);

  const agentStepsMap = useAgentSteps(streamingSteps, agents);

  const handleToggle = () => setCollapsed(!collapsed);

  if (collapsed) {
    return (
      <div className="border border-zinc-800/50 rounded-2xl bg-zinc-900/40 overflow-hidden">
        <TeamStatusBar agents={agents} collapsed onToggle={handleToggle} />
      </div>
    );
  }

  return (
    <div className="flex flex-col border border-zinc-800/50 rounded-2xl bg-zinc-900/40 overflow-hidden">
      <TeamStatusBar agents={agents} collapsed={false} onToggle={handleToggle} />
      <AgentLaneGrid agents={agents} agentStepsMap={agentStepsMap} />
      <TeamCommunicationBar communications={communications} />
      <TeamInterventionInput teamId={teamId} agents={agents} />
    </div>
  );
}
