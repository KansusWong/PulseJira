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
// Prompt file helpers — single source of truth for system prompts
// Agents with agents/{id}/prompts/system.md use that file directly.
// Both frontend edits and backend edits go through the same .md file.
// ---------------------------------------------------------------------------

const AGENTS_DIR = path.join(process.cwd(), 'agents');

/** Cached prompt content + timestamp per agent. TTL = 10 seconds. */
const _promptCache = new Map<string, { content: string; loadedAt: number }>();
const PROMPT_TTL_MS = 10_000;

function promptFilePath(agentId: string): string {
  return path.join(AGENTS_DIR, agentId, 'prompts', 'system.md');
}

/**
 * Check whether an agent has a prompt .md file.
 */
export function hasPromptFile(agentId: string): boolean {
  return fs.existsSync(promptFilePath(agentId));
}

/**
 * Load the system prompt from the .md file (with cache).
 * Returns empty string if file doesn't exist.
 */
export function loadPromptFile(agentId: string): string {
  const cached = _promptCache.get(agentId);
  if (cached && Date.now() - cached.loadedAt < PROMPT_TTL_MS) {
    return cached.content;
  }

  const filePath = promptFilePath(agentId);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      _promptCache.set(agentId, { content, loadedAt: Date.now() });
      return content;
    }
  } catch (e) {
    console.warn(`[agent-config] Failed to read prompt file for ${agentId}:`, e);
  }
  return '';
}

/**
 * Save the system prompt to the .md file and invalidate cache.
 */
export function savePromptFile(agentId: string, content: string): void {
  const filePath = promptFilePath(agentId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  _promptCache.delete(agentId);
}

// ---------------------------------------------------------------------------
// JSON file helpers (with TTL cache) — for non-prompt overrides (model, maxLoops, soul)
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
    override.soul === undefined
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

    // If the agent has a prompt .md file, use that as the single source of truth.
    // Otherwise fall back to the registered defaultPrompt.
    const promptFromFile = hasPromptFile(meta.id) ? loadPromptFile(meta.id) : '';
    const systemPrompt = promptFromFile || meta.defaultPrompt || '';

    // Strip systemPrompt from override — it now lives in the .md file
    const rawOverride = loadAgentConfig(meta.id);
    const { systemPrompt: _discarded, ...cleanOverride } = rawOverride;

    return {
      id: meta.id,
      displayName: meta.displayName,
      role: meta.role,
      runMode: meta.runMode,
      defaults: {
        model: defaultModel,
        maxLoops: meta.defaultMaxLoops,
        soul,
        systemPrompt,
      },
      override: cleanOverride,
      tools: meta.tools,
      skills: mergedSkills,
      isAIGenerated: meta.isAIGenerated,
      createdBy: meta.createdBy,
    };
  });
}
