import { loadSoul } from '@/agents/utils';
import { getAllAgents } from './agent-registry';
import { getAgentSkillOverrides, mergeAgentSkills } from './agent-skill-overrides';
import { resolveRedTeamDefaultModel } from '@/lib/services/red-team-llm';

// Ensure built-in agents are registered before anything reads the registry
import './builtin-agents';

const DEFAULT_MODEL = process.env.LLM_MODEL_NAME || 'glm-5';

export interface AgentOverride {
  model?: string;
  maxLoops?: number;
  soul?: string;
  systemPrompt?: string;
}

export interface AgentRegistryEntry {
  id: string;
  displayName: string;
  role: string;
  runMode: 'react' | 'single-shot';
  defaults: {
    model: string;
    maxLoops: number;
    soul: string;
    systemPrompt: string;
  };
  override: AgentOverride;
  tools: { name: string; description: string }[];
  skills: { name: string; description: string }[];
  /** Whether this agent was dynamically created by AI (Architect). */
  isAIGenerated?: boolean;
  /** Which agent created this one (e.g. "architect"). */
  createdBy?: string;
}

/**
 * Load the override config for a single agent.
 * With the legacy config.json removed, returns empty override.
 */
export function loadAgentConfig(_agentId: string): AgentOverride {
  return {};
}

/**
 * Save all agent overrides (no-op after legacy config.json removal).
 */
export function saveAgentConfig(_configs: Record<string, AgentOverride>): void {
  // no-op — legacy config.json has been removed
}

/**
 * Save a single agent's override (no-op after legacy config.json removal).
 */
export function saveOneAgentConfig(_agentId: string, _override: AgentOverride): void {
  // no-op — legacy config.json has been removed
}

/**
 * Return full registry of all agents with defaults, overrides, tools, and skills.
 * Used by the Settings API to power the frontend.
 */
export function getAgentRegistry(): AgentRegistryEntry[] {
  const agents = getAllAgents();
  const criticModel = resolveRedTeamDefaultModel(DEFAULT_MODEL);

  return agents
    .filter((meta) => !meta.internal && !meta.hidden)
    .map((meta) => {
    const soul = loadSoul(meta.id);
    const defaultModel = meta.id === 'critic' ? criticModel : (meta.defaultModel || DEFAULT_MODEL);
    const mergedSkills = mergeAgentSkills(meta.skills, getAgentSkillOverrides(meta.id));

    return {
      id: meta.id,
      displayName: meta.displayName,
      role: meta.role,
      runMode: meta.runMode,
      defaults: {
        model: defaultModel,
        maxLoops: meta.defaultMaxLoops,
        soul,
        systemPrompt: meta.defaultPrompt || '',
      },
      override: {},
      tools: meta.tools,
      skills: mergedSkills,
      isAIGenerated: meta.isAIGenerated,
      createdBy: meta.createdBy,
    };
  });
}
