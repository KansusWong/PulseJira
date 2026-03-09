/**
 * Dynamic Agent Registry — single source of truth for agent metadata.
 *
 * Server-side only (imports prompt modules, fs utilities, etc.).
 * For client-safe UI metadata, use `./agent-ui-meta.ts` instead.
 */

export interface AgentMeta {
  id: string;
  displayName: string;
  role: string;
  runMode: 'react' | 'single-shot';
  defaultModel?: string;
  defaultMaxLoops: number;
  defaultPrompt: string;
  tools: { name: string; description: string }[];
  skills: { name: string; description: string }[];
  /** Whether this agent was dynamically created by the Architect (AI-generated). */
  isAIGenerated?: boolean;
  /** Which agent created this one (e.g. "architect"). */
  createdBy?: string;
  /** Project ID this agent was created for (medium execution mode). */
  projectId?: string;
}

const registry = new Map<string, AgentMeta>();

export function registerAgent(meta: AgentMeta): void {
  registry.set(meta.id, meta);
}

/** Remove an agent from the metadata registry. */
export function deregisterAgent(id: string): boolean {
  return registry.delete(id);
}

export function getAgent(id: string): AgentMeta | undefined {
  return registry.get(id);
}

export function getAllAgents(): AgentMeta[] {
  return Array.from(registry.values());
}

export function getAgentIds(): string[] {
  return Array.from(registry.keys());
}
