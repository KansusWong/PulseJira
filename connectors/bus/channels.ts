/**
 * Predefined channels for Agent communication.
 *
 * Prepare pipeline: researcher → blue-team → critic → arbitrator
 * Plan pipeline:    pm → tech-lead
 * Global:           agent-log (broadcast to SSE)
 */
export const CHANNELS = {
  // Prepare stage
  RESEARCHER_TO_BLUE_TEAM: 'researcher->blue-team',
  BLUE_TEAM_TO_CRITIC: 'blue-team->critic',
  CRITIC_TO_ARBITRATOR: 'critic->arbitrator',

  // Plan stage
  PM_TO_TECH_LEAD: 'pm->tech-lead',

  // Global
  AGENT_LOG: 'agent-log',

  // Meta-agent pipeline
  DECISION_MAKER_LOG: 'decision-maker-log',
  ARCHITECT_LOG: 'architect-log',
  SUPERVISOR_LOG: 'supervisor-log',
  META_PIPELINE: 'meta-pipeline',

  // Shared Blackboard
  BLACKBOARD: 'blackboard',
} as const;

export type Channel = typeof CHANNELS[keyof typeof CHANNELS];

/** Dynamically generate a channel name for agent-to-agent communication. */
export function agentChannel(from: string, to: string): string {
  return `${from}->${to}`;
}
