/**
 * SubagentRegistry — DEPRECATED compatibility layer.
 *
 * All new code should use MateRegistry (lib/services/mate-registry.ts) instead.
 * This file is retained solely for backward compatibility with existing callers:
 *   - app/api/settings/agents/route.ts (uses parseFrontmatter)
 *   - lib/tools/index.ts (re-exports SubagentRegistry)
 *
 * Internally delegates to MateRegistry for all matching operations.
 *
 * @deprecated Use MateRegistry from lib/services/mate-registry.ts instead.
 */

import { getMateRegistry, MateRegistry } from '../services/mate-registry';
import type { MateDefinition } from '../core/types';

// =====================================================================
// Re-export parseFrontmatter for backward compatibility
// (used by app/api/settings/agents/route.ts)
// =====================================================================

/**
 * Parse a simple YAML-like frontmatter from a markdown file.
 * Supports: name, description, tools, model fields.
 */
export function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};

  if (!content.startsWith('---')) {
    return { meta, body: content };
  }

  const endIdx = content.indexOf('\n---', 3);
  if (endIdx < 0) {
    return { meta, body: content };
  }

  const frontmatter = content.substring(3, endIdx).trim();
  const body = content.substring(endIdx + 4).trim();

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  return { meta, body };
}

// =====================================================================
// Types — kept for compatibility
// =====================================================================

/** @deprecated Use MateDefinition from lib/core/types.ts instead. */
export interface SubagentDefinition {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
}

// =====================================================================
// Adapter: MateDefinition → SubagentDefinition
// =====================================================================

function toSubagentDef(mate: MateDefinition): SubagentDefinition {
  return {
    name: mate.name,
    description: mate.description,
    tools: mate.tools_allow,
    model: mate.model,
    systemPrompt: mate.system_prompt,
  };
}

// =====================================================================
// SubagentRegistry (compatibility proxy)
// =====================================================================

let _singleton: SubagentRegistry | null = null;
let _singletonDirs: string | null = null;

/**
 * @deprecated Use getMateRegistry() from lib/services/mate-registry.ts instead.
 */
export function getSubagentRegistry(searchDirs: string[]): SubagentRegistry {
  const key = searchDirs.join('\0');
  if (_singleton && _singletonDirs === key) return _singleton;
  _singleton = new SubagentRegistry(searchDirs);
  _singletonDirs = key;
  return _singleton;
}

/** @deprecated Use MateRegistry from lib/services/mate-registry.ts instead. */
export class SubagentRegistry {
  private _mateRegistry: MateRegistry;

  constructor(searchDirs: string[]) {
    this._mateRegistry = getMateRegistry(searchDirs);
  }

  refresh(): void {
    this._mateRegistry.refresh();
  }

  getAll(): SubagentDefinition[] {
    return this._mateRegistry.getAll().map(toSubagentDef);
  }

  get(name: string): SubagentDefinition | undefined {
    const mate = this._mateRegistry.get(name);
    return mate ? toSubagentDef(mate) : undefined;
  }

  matchByDescription(taskDesc: string): string | null {
    return this._mateRegistry.matchByDescription(taskDesc);
  }
}
