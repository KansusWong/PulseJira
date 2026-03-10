import fs from 'fs';
import path from 'path';
import { loadSoul } from '@/agents/utils';
import { getAllAgents } from './agent-registry';
import { getAgentSkillOverrides, mergeAgentSkills } from './agent-skill-overrides';
import { resolveRedTeamDefaultModel } from '@/lib/services/red-team-llm';

// Ensure built-in agents are registered before anything reads the registry
import './builtin-agents';

const CONFIG_PATH = path.join(process.cwd(), 'agents', 'config.json');
const DEFAULT_MODEL = process.env.LLM_MODEL_NAME || 'gpt-4o';

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

function readConfigFile(): Record<string, AgentOverride> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[agent-config] Failed to read config.json, using defaults:', e);
  }
  return {};
}

function writeConfigFile(configs: Record<string, AgentOverride>): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
}

/**
 * Load the override config for a single agent.
 * Falls back to defaults for any unset field.
 */
export function loadAgentConfig(agentId: string): AgentOverride {
  const allConfigs = readConfigFile();
  return allConfigs[agentId] || {};
}

/**
 * Save all agent overrides to config.json.
 */
export function saveAgentConfig(configs: Record<string, AgentOverride>): void {
  writeConfigFile(configs);
}

/**
 * Save a single agent's override, merging into the existing config file.
 * Removes the agent entry entirely if the override is empty.
 */
export function saveOneAgentConfig(agentId: string, override: AgentOverride): void {
  const existing = readConfigFile();
  if (Object.keys(override).length === 0) {
    delete existing[agentId];
  } else {
    existing[agentId] = override;
  }
  writeConfigFile(existing);
}

/**
 * Return full registry of all agents with defaults, overrides, tools, and skills.
 * Used by the Settings API to power the frontend.
 */
export function getAgentRegistry(): AgentRegistryEntry[] {
  const overrides = readConfigFile();
  const agents = getAllAgents();
  const criticModel = resolveRedTeamDefaultModel(DEFAULT_MODEL);

  return agents
    .filter((meta) => !meta.internal)
    .map((meta) => {
    const override = overrides[meta.id] || {};
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
        systemPrompt: meta.defaultPrompt,
      },
      override,
      tools: meta.tools,
      skills: mergedSkills,
      isAIGenerated: meta.isAIGenerated,
      createdBy: meta.createdBy,
    };
  });
}
