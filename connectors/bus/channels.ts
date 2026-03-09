/**
 * Predefined channels for Agent communication.
 *
 * Global:           agent-log (broadcast to SSE)
 * Meta-agent:       decision-maker-log, architect-log, supervisor-log, meta-pipeline
 * Shared state:     blackboard
 */
export const CHANNELS = {
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
