/**
 * SubagentRegistry — manages subagent definitions loaded from .md files.
 *
 * Aligns with reference task.py's subagent registry system.
 * Supports keyword-based matching to auto-select subagents for tasks.
 */

import path from 'path';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// =====================================================================
// Types
// =====================================================================

export interface SubagentDefinition {
  name: string;
  description: string;
  tools: string[];
  model: string;        // 'inherit' | specific model name
  systemPrompt: string;
}

// =====================================================================
// Frontmatter parser
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
// Keyword matching algorithm — from task.py:274-333
// =====================================================================

/** Special keyword pairs that get bonus scores. */
const SPECIAL_MATCHES: Record<string, { match: string; bonus: number }[]> = {
  review: [{ match: 'review', bonus: 3 }],
  code: [{ match: 'code', bonus: 2 }],
  research: [{ match: 'research', bonus: 3 }],
  debug: [{ match: 'debug', bonus: 3 }],
  test: [{ match: 'test', bonus: 2 }],
  deploy: [{ match: 'deploy', bonus: 3 }],
  refactor: [{ match: 'refactor', bonus: 3 }],
  analyze: [{ match: 'analyze', bonus: 2 }, { match: 'analysis', bonus: 2 }],
};

/**
 * Score how well a task description matches a subagent's description.
 * Returns a score >= 0. Higher = better match.
 */
function scoreMatch(taskDesc: string, agentDesc: string): number {
  const taskWords = taskDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);
  const agentWords = agentDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);

  let score = 0;

  // Basic word overlap scoring
  for (const word of taskWords) {
    if (word.length <= 3) continue; // Skip short words
    if (agentWords.some(aw => aw.includes(word) || word.includes(aw))) {
      score += 1;
    }
  }

  // Special match bonuses
  for (const [keyword, matches] of Object.entries(SPECIAL_MATCHES)) {
    const taskHas = taskWords.some(w => w.includes(keyword));
    if (taskHas) {
      for (const { match, bonus } of matches) {
        if (agentWords.some(w => w.includes(match))) {
          score += bonus;
        }
      }
    }
  }

  return score;
}

// =====================================================================
// SubagentRegistry
// =====================================================================

// Process-level singleton cache
let _singleton: SubagentRegistry | null = null;
let _singletonDirs: string | null = null;

/**
 * Get (or create) the process-level SubagentRegistry singleton.
 * Filesystem scan happens only once; call registry.refresh() to force rescan.
 */
export function getSubagentRegistry(searchDirs: string[]): SubagentRegistry {
  const key = searchDirs.join('\0');
  if (_singleton && _singletonDirs === key) return _singleton;
  _singleton = new SubagentRegistry(searchDirs);
  _singletonDirs = key;
  return _singleton;
}

export class SubagentRegistry {
  private definitions: SubagentDefinition[] = [];
  private searchDirs: string[];

  constructor(searchDirs: string[]) {
    this.searchDirs = searchDirs;
    this.refresh();
  }

  /** Scan search directories for .md subagent definitions. */
  refresh(): void {
    this.definitions = [];

    for (const dir of this.searchDirs) {
      // Source 1: flat .md files in {dir}/.agents/ (legacy format)
      this._scanFlatDir(path.join(dir, '.agents'));

      // Source 2: nested subagents/{name}/agent.md (new format)
      this._scanNestedDir(path.join(dir, 'subagents'));
    }
  }

  /** Scan a flat directory for *.md subagent definitions. */
  private _scanFlatDir(agentsDir: string): void {
    let files: string[];
    try {
      files = fs.readdirSync(agentsDir);
    } catch {
      return; // Directory doesn't exist
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(agentsDir, file);
      this._loadDefinition(filePath, path.basename(file, '.md'));
    }
  }

  /** Scan nested directories: each subdirectory may contain an agent.md. */
  private _scanNestedDir(subagentsDir: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(subagentsDir);
    } catch {
      return; // Directory doesn't exist
    }

    for (const entry of entries) {
      const entryPath = path.join(subagentsDir, entry);
      try {
        if (!fs.statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const agentMdPath = path.join(entryPath, 'agent.md');
      try {
        fs.accessSync(agentMdPath);
      } catch {
        continue; // No agent.md in this subdirectory
      }

      // Skip if already loaded (e.g. same name from .agents/)
      if (this.definitions.some(d => d.name === entry)) continue;

      this._loadDefinition(agentMdPath, entry);
    }
  }

  /** Load a single .md file as a subagent definition. */
  private _loadDefinition(filePath: string, fallbackName: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      if (!meta.name) {
        meta.name = fallbackName;
      }

      this.definitions.push({
        name: meta.name,
        description: meta.description || '',
        tools: (meta.tools || '').split(',').map(t => t.trim()).filter(Boolean),
        model: meta.model || 'inherit',
        systemPrompt: body,
      });
    } catch {
      // Skip unreadable files
    }
  }

  getAll(): SubagentDefinition[] {
    return this.definitions;
  }

  get(name: string): SubagentDefinition | undefined {
    return this.definitions.find(d => d.name === name);
  }

  /**
   * Find the best matching subagent for a task description.
   * Returns null if no match scores >= 2.
   */
  matchByDescription(taskDesc: string): string | null {
    if (this.definitions.length === 0) return null;

    let bestName: string | null = null;
    let bestScore = 0;

    for (const def of this.definitions) {
      const score = scoreMatch(taskDesc, def.description);
      if (score > bestScore) {
        bestScore = score;
        bestName = def.name;
      }
    }

    // Threshold: score must be >= 2 to count as a match
    return bestScore >= 2 ? bestName : null;
  }
}
