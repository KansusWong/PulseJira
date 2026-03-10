/**
 * Dynamic Agent Loader — auto-registers AI-generated (persisted) agents on startup.
 *
 * Reads `agents/dynamic-registry.json` and registers each entry in both
 * the metadata registry (for Settings UI / list_agents) and the factory
 * registry (for spawn_agent runtime invocation).
 *
 * Import this module as a side-effect after builtin-agents to populate the
 * registries: `import './dynamic-agents';`
 */
import fs from 'fs';
import path from 'path';
import { registerAgent } from './agent-registry';
import { loadAgentConfig } from './agent-config';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { loadSoul, mergeSoulWithPrompt } from '@/agents/utils';
import { BaseAgent } from '@/lib/core/base-agent';
import { getTools } from '@/lib/tools/tool-registry';

const REGISTRY_PATH = path.join(process.cwd(), 'agents', 'dynamic-registry.json');

export interface DynamicAgentEntry {
  id: string;
  displayName: string;
  role: string;
  runMode: 'react' | 'single-shot';
  defaultMaxLoops: number;
  defaultPrompt: string;
  tools: { name: string; description: string }[];
  skills: { name: string; description: string }[];
  exitToolName?: string | null;
  createdBy?: string;
  isAIGenerated: boolean;
}

// ---------------------------------------------------------------------------
// Read / Write helpers (exported for persist-agent to reuse)
// ---------------------------------------------------------------------------

export function readDynamicRegistry(): DynamicAgentEntry[] {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('[dynamic-agents] Failed to read registry:', e);
  }
  return [];
}

export function writeDynamicRegistry(entries: DynamicAgentEntry[]): void {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Upsert a single agent entry into the persistent registry file.
 * If an entry with the same `id` already exists it is replaced.
 */
export function appendToDynamicRegistry(entry: DynamicAgentEntry): void {
  const entries = readDynamicRegistry();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  writeDynamicRegistry(entries);
}

// ---------------------------------------------------------------------------
// Lazy loader — only loads dynamic agents when explicitly requested
// ---------------------------------------------------------------------------

let _loaded = false;

/**
 * Ensure persisted dynamic agents are registered.
 * Idempotent — safe to call multiple times, only reads disk on the first call.
 * Call this before operations that need dynamic agents (list_agents, spawn_agent, L3 agent_team).
 */
export function ensureDynamicAgentsLoaded(): void {
  if (_loaded) return;
  _loaded = true;

  const entries = readDynamicRegistry();
  if (entries.length === 0) return;

  for (const entry of entries) {
    registerAgent({
      id: entry.id,
      displayName: entry.displayName,
      role: entry.role,
      runMode: entry.runMode,
      defaultMaxLoops: entry.defaultMaxLoops,
      defaultPrompt: entry.defaultPrompt,
      tools: entry.tools,
      skills: entry.skills,
      isAIGenerated: entry.isAIGenerated ?? true,
      createdBy: entry.createdBy,
    });

    const captured = entry;
    registerAgentFactory(entry.id, (options?: any) => {
      const override = loadAgentConfig(captured.id);
      const soul = override.soul ?? loadSoul(captured.id);
      const basePrompt = override.systemPrompt ?? captured.defaultPrompt;
      const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);
      const toolNames = captured.tools.map((t) => t.name).filter(Boolean);

      return new BaseAgent({
        name: captured.id,
        systemPrompt,
        tools: options?.tools ?? (toolNames.length > 0 ? getTools(...toolNames) : []),
        maxLoops: options?.maxLoops ?? override.maxLoops ?? captured.defaultMaxLoops,
        model: options?.model ?? override.model,
        exitToolName: captured.exitToolName ?? undefined,
        initialMessages: options?.initialMessages,
      });
    });
  }

  console.log(
    `[dynamic-agents] Lazy-loaded ${entries.length} AI-generated agent(s): ${entries.map((e) => e.id).join(', ')}`,
  );
}
