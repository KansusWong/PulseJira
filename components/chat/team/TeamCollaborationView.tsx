"use client";

import { usePulseStore } from "@/store/usePulseStore.new";
import { useAgentSteps } from "./useAgentSteps";
import { TeamStatusBar } from "./TeamStatusBar";
import { AgentLaneGrid } from "./AgentLaneGrid";
import { TeamInterventionInput } from "./TeamInterventionInput";

export function TeamCollaborationView() {
  const agents = usePulseStore((s) => s.teamPanel.agents);
  const teamId = usePulseStore((s) => s.teamPanel.teamId);
  const collapsed = usePulseStore((s) => s.teamCollaboration.collapsed);
  const setCollapsed = usePulseStore((s) => s.setTeamCollaborationCollapsed);
  const communications = usePulseStore((s) => s.teamPanel.communications);
  const streamingSteps = usePulseStore((s) => s.streamingSteps);

  const mateChatMessages = usePulseStore((s) => s.mateChatMessages);
  const mateStreamingTokens = usePulseStore((s) => s.mateStreamingTokens);
  const agentLanePage = usePulseStore((s) => s.agentLanePage);
  const setAgentLanePage = usePulseStore((s) => s.setAgentLanePage);

  const agentStepsMap = useAgentSteps(streamingSteps, agents);

  const handleToggle = () => setCollapsed(!collapsed);

  if (collapsed) {
    return (
      <div className="border border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-surface)]/40 overflow-hidden">
        <TeamStatusBar agents={agents} collapsed onToggle={handleToggle} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-surface)]/40 overflow-hidden">
      <TeamStatusBar agents={agents} collapsed={false} onToggle={handleToggle} />
      <AgentLaneGrid
        agents={agents}
        agentStepsMap={agentStepsMap}
        page={agentLanePage}
        onPageChange={setAgentLanePage}
        teamId={teamId}
        mateChatMessages={mateChatMessages}
        mateStreamingTokens={mateStreamingTokens}
        communications={communications}
      />
      <TeamInterventionInput teamId={teamId} agents={agents} />
    </div>
  );
}
