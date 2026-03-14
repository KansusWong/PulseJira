import fs from 'fs';
import path from 'path';
import { loadSoul } from '@/agents/utils';
import { getAllAgents } from './agent-registry';
import { getAgentSkillOverrides, mergeAgentSkills } from './agent-skill-overrides';
import { resolveRedTeamDefaultModel } from '@/lib/services/red-team-llm';

// Ensure built-in agents are registered before anything reads the registry
import './builtin-agents';

const DEFAULT_MODEL = process.env.LLM_MODEL_NAME || 'glm-5';

const CONFIG_PATH = path.join(process.cwd(), 'agents', 'agent-config-overrides.json');

export interface AgentOverride {
  model?: string;
  maxLoops?: number;
  soul?: string;
  systemPrompt?: string;
}

type AgentConfigMap = Record<string, AgentOverride>;

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

// ---------------------------------------------------------------------------
// JSON file helpers (with TTL cache)
// ---------------------------------------------------------------------------

/** Cached config data + timestamp. TTL = 30 seconds. */
let _configCache: { data: AgentConfigMap; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 30_000;

function readConfigFile(): AgentConfigMap {
  // Return cached if within TTL
  if (_configCache && Date.now() - _configCache.loadedAt < CONFIG_TTL_MS) {
    return _configCache.data;
  }

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as AgentConfigMap;
      const data = parsed && typeof parsed === 'object' ? parsed : {};
      _configCache = { data, loadedAt: Date.now() };
      return data;
    }
  } catch (e) {
    console.warn('[agent-config] Failed to read config overrides:', e);
  }
  const empty = {};
  _configCache = { data: empty, loadedAt: Date.now() };
  return empty;
}

/** Invalidate config cache (called on write). */
function invalidateConfigCache(): void {
  _configCache = null;
}

function writeConfigFile(configs: AgentConfigMap): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
  invalidateConfigCache();
}

function isEmptyOverride(override: AgentOverride): boolean {
  return (
    override.model === undefined &&
    override.maxLoops === undefined &&
    override.soul === undefined &&
    override.systemPrompt === undefined
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the override config for a single agent from disk.
 */
export function loadAgentConfig(agentId: string): AgentOverride {
  const all = readConfigFile();
  return all[agentId] ?? {};
}

/**
 * Save all agent overrides (batch write).
 */
export function saveAgentConfig(configs: Record<string, AgentOverride>): void {
  const existing = readConfigFile();
  for (const [id, override] of Object.entries(configs)) {
    if (isEmptyOverride(override)) {
      delete existing[id];
    } else {
      existing[id] = override;
    }
  }
  writeConfigFile(existing);
}

/**
 * Save a single agent's override to disk.
 * Removes the key entirely when the override is empty to keep the file clean.
 */
export function saveOneAgentConfig(agentId: string, override: AgentOverride): void {
  const all = readConfigFile();
  if (isEmptyOverride(override)) {
    delete all[agentId];
  } else {
    all[agentId] = override;
  }
  writeConfigFile(all);
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
      override: loadAgentConfig(meta.id),
      tools: meta.tools,
      skills: mergedSkills,
      isAIGenerated: meta.isAIGenerated,
      createdBy: meta.createdBy,
    };
  });
}
